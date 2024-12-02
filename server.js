const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { v4: uuidv4 } = require('uuid');
const axios = require("axios");
require("dotenv").config();

const Bike = require("./models/Bike");
const Trip = require('./models/Trip'); // Import the Trip model
// Initialize Express App
const app = express();

// MongoDB connection
mongoose
  .connect("mongodb://127.0.0.1:27017/royal_bike_club", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  otp: String,
  otpExpiry: Date,
  isAdmin: { type: Boolean, default: false },
});

const User = mongoose.model("User", userSchema);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve uploaded images
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session Middleware
app.use(
  session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: false,
  })
);

// Configure Multer for Image Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads", "bikes");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Nodemailer SMTP Transport Setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function generateRentId() {
  return uuidv4(); // This will generate a unique ID
}

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next(); // User is logged in, proceed to the next middleware or route handler
  } else {
    return res.redirect('/login'); // User is not logged in, redirect to login page
  }
}

// Routes

// Home Page
app.get("/", async (req, res) => {
  try {
    const featuredBikes = await Bike.find({ featured: true }); // Fetch featured bikes
    const user = req.session.user || null; // Retrieve user from session, or null if not logged in
    res.render("index", { featuredBikes, user });
  } catch (error) {
    console.error("Error fetching featured bikes:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Register Page
app.get("/register", (req, res) => {
  res.render("register");
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword });
    res.redirect("/login");
  } catch (error) {
    console.error("Error during registration:", error);
    res.render("register", { message: "Registration failed. Try again." });
  }
});

// Login Page
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("login", { message: "User not found. Please register first." });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.render("login", { message: "Incorrect password. Please try again." });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP to email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP for Login",
      text: `Your OTP is ${otp}. It will expire in 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);

    // Store email and flow type in session
    req.session.tempUser = email;
    req.session.isLoginOtp = true; // Distinguish this from password reset flow

    return res.redirect("/verify-otp");
  } catch (error) {
    console.error("Error during login:", error);
    res.render("login", { message: "Login failed. Try again." });
  }
});



// OTP Verification
// GET route for /verify-otp
// Verify OTP route (GET)
app.get("/verify-otp", (req, res) => {
  if (!req.session.tempUser) {
    // If no tempUser, redirect to login
    return res.redirect("/login");
  }

  res.render("verifyOtp", { message: null });
});

// Verify OTP route (POST)
app.post("/verify-otp", async (req, res) => {
  const { otp } = req.body;
  const email = req.session.tempUser;

  try {
    const user = await User.findOne({ email });

    if (!user || user.otp !== otp || Date.now() > user.otpExpiry) {
      return res.render("verifyOtp", { message: "Invalid or expired OTP. Please try again." });
    }

    // Clear OTP and expiry
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    if (req.session.isLoginOtp) {
      // Handle login flow
      req.session.user = { id: user._id, email: user.email };
      req.session.isAdmin = user.isAdmin; // Admin check

      req.session.tempUser = null;
      req.session.isLoginOtp = null;

      return user.isAdmin ? res.redirect("/admin/dashboard") : res.redirect("/user-dashboard");
    } else {
      // Handle password reset flow
      return res.redirect("/reset-password");
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.render("verifyOtp", { message: "An error occurred. Please try again." });
  }
});


// Forgot Password GET route
// Forgot Password route (GET)
app.get("/forgot-password", (req, res) => {
  res.render("forgotPassword", { message: null});
});

// Forgot Password route (POST)
// Forgot Password route (POST)
app.post('/forgot-password', async (req, res) => {
  try {
      const email = req.body.email;

      // Find user by email
      const user = await User.findOne({ email });

      if (!user) {
          return res.render("forgotPassword", { message: "User not found" });
      }

      // Generate OTP and expiry time (valid for 10 minutes)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes

      // Save OTP and expiry time to the user's record
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      await user.save();

      // Set up email transporter
      const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
              user: process.env.EMAIL_USER,  // Your email
              pass: process.env.EMAIL_PASS,  // Your email password
          },
      });

      // Email options
      const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Your OTP for Password Reset",
          text: `Your OTP is ${otp}. It will expire in 10 minutes.`,
      };

      // Send OTP to user's email
      await transporter.sendMail(mailOptions);

      // Store email in session
      req.session.tempUser = email;

      // Redirect to OTP verification page
      res.redirect("/verify-otp");

  } catch (error) {
      console.error("Error during forgot password process:", error);
      // Ensure message is passed in case of an error
      res.render("forgotPassword", { message: "Error occurred. Please try again." });
  }
});


// GET route for /reset-password (display the password reset form)
app.get("/reset-password", (req, res) => {
  if (!req.session.tempUser) return res.redirect("/login"); // If no tempUser, redirect to login
  res.render("resetPassword", { email: req.session.tempUser, message: null });
});

// POST route for /reset-password (handle password reset)
app.post("/reset-password", async (req, res) => {
  const { newPassword } = req.body;
  const email = req.session.tempUser;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("resetPassword", { message: "User not found.", email });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    req.session.tempUser = null;

    res.redirect("/login");
  } catch (error) {
    console.error("Error resetting password:", error);
    res.render("resetPassword", {email, message: "Error resetting password. Please try again." });
  }
});



// User Dashboard
app.get("/user-dashboard", isAuthenticated, async (req, res) => {
  if (!req.session.user) return res.redirect("/login"); // Redirect if the user is not logged in

  try {
    const featuredBikes = await Bike.find({ featured: true });

    res.render("index", { user: req.session.user, featuredBikes });
  } catch (error) {
    console.error("Error fetching user dashboard data:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/rentals", async (req, res) => {
  try {
    const rentals = await Bike.find(); // Fetch all bikes for rentals
    res.render("rentals", { rentals });
  } catch (error) {
    console.error("Error fetching rentals:", error);
    res.status(500).send("Error fetching rentals");
  }
});



app.post("/rentals", async (req, res) => {
  const { name, rentalPricePerDay, quantity, imageUrl } = req.body;

  try {
    const rental = new Bike({
      name,
      rentalPricePerDay,
      quantity,
      imageUrl,
    });

    await rental.save();
    res.redirect("/rentals");
  } catch (error) {
    console.error("Error adding rental:", error);
    res.status(500).send("Error adding rental");
  }
});



app.get("/bikes", async (req, res) => {
  try {
    const bikes = await Bike.find(); // Fetch all bikes
    res.render("bikes", { bikes });
  } catch (error) {
    console.error("Error fetching bikes:", error);
    res.status(500).send("Error fetching bikes");
  }
});



app.post("/bikes", async (req, res) => {
  const { name, sellingPrice, rentalPricePerDay, quantity, imageUrl } = req.body;

  try {
    const bike = new Bike({
      name,
      sellingPrice,
      rentalPricePerDay,
      quantity,
      imageUrl,
    });

    await bike.save();
    res.redirect("/bikes");
  } catch (error) {
    console.error("Error adding bike:", error);
    res.status(500).send("Error adding bike");
  }
});

// Route to display available bikes for rentals


// Route to handle renting a bike
app.get('/rent/:id',isAuthenticated, async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const bikeId = req.params.id;

  // Validate if the bike ID is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(bikeId)) {
      return res.status(400).send('Invalid bike ID');
  }

  try {
      // Attempt to find the bike by its ID
      const bike = await Bike.findById(bikeId);
      if (!bike) {
          return res.status(404).send('Bike not found');
      }

      // Generate the rentId
      const rentId = generateRentId(); // Now this function will work

      // Log the bike details for debugging
      console.log("Bike Details: ", bike);
      console.log("Generated Rent ID: ", rentId);

      // Render the rent-bike page with bikeDetails and rentId
      res.render('rent-bike', { bikeDetails: bike, rentId: rentId });
  } catch (error) {
      // Log the error details for debugging
      console.error("Error while processing rent request: ", error);
      res.status(500).send('Server error');
  }
});

app.get('/rent/confirm', isAuthenticated,(req, res) => {
  if (!req.session.user) return res.redirect("/login"); // Redirect if the user is not logged in
  // Render the confirm rent page
  res.render('rent-bike');
})
app.post('/rent/confirm', async (req, res) => {
  try {
      const { bikeId, rentId, renterName, renterMail, rentalDays, paymentMethod } = req.body;
      
      const bikeDetails = await Bike.findById(bikeId);
      
      if (!bikeDetails || bikeDetails.quantity <= 0) {
          return res.status(404).send("Bike is not available");
      }

      // Calculate the total cost
      const totalCost = bikeDetails.rentalPricePerDay * rentalDays;

      // Reduce the quantity of the bike
      bikeDetails.quantity -= 1;
      await bikeDetails.save();

      // Send confirmation email
      const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
              user: 'sarthakjm2284@gmail.com', // Your email
              pass: "xngu agtf hsfh evmb"    // Your email password or app password
          }
      });

      const mailOptions = {
          from: 'sarthakjm2284@gmail.com',
          to: renterMail,
          subject: 'Bike Rental Confirmation',
          text: `
              Dear ${renterName},

              Your bike rental has been successfully booked! Here are your booking details:

              Bike Name: ${bikeDetails.name}
              Rental Days: ${rentalDays}
              Total Cost: ₹${totalCost}
              Payment Method: ${paymentMethod}

              Thank you for renting with Royal Bike Club!

              Best regards,
              Royal Bike Club
          `
      };

      await transporter.sendMail(mailOptions);

      res.send('Booking confirmed! A confirmation email has been sent.');
  } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
  }
});




app.get('/trips', async (req, res) => {
  try {
    const trips = await Trip.find(); // Fetch trips from the database
    console.log(trips); // Add this to log the trips and confirm that you're getting data
    res.render('trips', { trips: trips }); // Pass trips to the EJS template
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).send("Internal Server Error");
  }
});






app.post('/book-trip/:id', async (req, res) => {
  const tripId = req.params.id;
  const seatsToBook = parseInt(req.body.seats, 10); // Number of seats user wants to book

  try {
      const trip = await Trip.findById(tripId);

      if (!trip) {
          return res.status(404).send("Trip not found");
      }

      if (trip.numberOfSeatsLeft < seatsToBook) {
          return res.status(400).send("Not enough seats available for booking");
      }

      // Deduct the seats
      trip.numberOfSeatsLeft -= seatsToBook;

      // Save the updated trip
      await trip.save();

      res.redirect('/trips'); // Redirect back to the trips page
  } catch (error) {
      console.error("Error booking trip:", error);
      res.status(500).send("Error booking trip");
  }
});




// Admin Dashboard
app.get('/admin/dashboard', async (req, res) => {
  try {
    const bikes = await Bike.find(); // Fetch all bikes
    res.render('adminDashboard', { bikes }); // Pass the bikes to the template
  } catch (error) {
    console.error("Error fetching bikes:", error);
    res.status(500).send("Internal Server Error");
  }
});


// Add Bike Form
app.get("/admin/add-bike-form", (req, res) => {
  if (!req.session.admin) return res.redirect("/login");
  res.render("addBikeForm");
});

// Add Bike
app.post("/admin/add-bike", async (req, res) => {
  const { name, type, sellingPrice, rentalPricePerDay, quantity, imageUrl } = req.body;

  try {
    // Validate required fields
    if (!name || !type || !sellingPrice || !rentalPricePerDay || !quantity || !imageUrl) {
      return res.status(400).send("All fields are required.");
    }

    // Generate a unique filename for the downloaded image
    const filename = `${Date.now()}-${name.replace(/\s+/g, "-")}.jpg`;
    const savePath = path.join(__dirname, "uploads", "bikes", filename);

    // Download the image from the provided URL and save it locally
    const writer = fs.createWriteStream(savePath);
    const response = await axios({
      url: imageUrl,
      method: "GET",
      responseType: "stream",
    });

    // Pipe the image to the file system and wait for it to finish
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Create a new bike entry in the database
    const bike = new Bike({
      name,
      type,
      sellingPrice,
      rentalPricePerDay,
      quantity,
      imageUrl: `/uploads/bikes/${filename}`, // Store the relative path
    });

    await bike.save();
    res.redirect("/admin/view-bikes");
  } catch (error) {
    console.error("Error adding bike:", error);
    res.status(500).send("Failed to add bike.");
  }
});

// Update bike route (GET request for the update form)
app.get('/admin/update-bike/:id', async (req, res) => {
  const bikeId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(bikeId)) {
    return res.status(400).send("Invalid Bike ID");
  }
  try {
    const bike = await Bike.findById(bikeId);
    if (!bike) {
      return res.status(404).send("Bike not found");
    }
    res.render('edit-bike', { bike });
  } catch (error) {
    console.error("Error fetching bike:", error);
    res.status(500).send("Internal Server Error");
  }
});

// POST request to update bike details
app.post('/admin/update-bike/:id', async (req, res) => {
  const bikeId = req.params.id;
  const { name, type, sellingPrice, rentalPricePerDay, quantity, imageUrl } = req.body;

  if (!mongoose.Types.ObjectId.isValid(bikeId)) {
    return res.status(400).send("Invalid Bike ID");
  }

  try {
    const bike = await Bike.findById(bikeId);
    if (!bike) {
      return res.status(404).send("Bike not found");
    }

    // Update bike fields
    bike.name = name;
    bike.type = type;
    bike.sellingPrice = sellingPrice;
    bike.rentalPricePerDay = rentalPricePerDay;
    bike.quantity = quantity;

    // If a new image is provided, update it
    if (imageUrl) {
      bike.imageUrl = imageUrl;
    }

    // Save the updated bike
    await bike.save();
    res.redirect('/admin/view-bikes');
  } catch (error) {
    console.error("Error updating bike:", error);
    res.status(500).send("Error updating bike");
  }
});


app.get('/admin/add-trip', (req, res) => {
  if (!req.session.admin) return res.redirect("/login");  // Ensure admin login
  res.render("addTripForm", { message: null });  // Render form with no initial error message
});
app.post('/admin/add-trip', async (req, res) => {
  const { title, description, price, imageUrl, startDate, endDate, totalSeats, numberofSeatsLeft } = req.body;

  try {
    // Validate required fields
    if (!title || !description || !price || !imageUrl || !startDate || !endDate || !totalSeats) {
      return res.render("addTripForm", { message: "All fields are required." });
    }

    // Create a new trip entry
    const newTrip = new Trip({
      title,
      description,
      price,
      imageUrl,
      startDate,
      endDate,
      totalSeats,
      numberofSeatsLeft: numberofSeatsLeft|| totalSeats,  
    });

    // Save the trip to the database
    await newTrip.save();
    res.redirect("/admin/view-trips");  // Redirect to the trip list after adding a trip
  } catch (error) {
    console.error("Error adding trip:", error);
    res.render("addTripForm", { message: "Failed to add trip. Please try again." });
  }
});




app.get('/admin/view-bike/:id', async (req, res) => {
  const bikeId = req.params.id;
  try {
    const bike = await Bike.findById(bikeId);
    if (!bike) {
      return res.status(404).send('Bike not found');
    }
    res.render('viewBikeDetails', { bike }); // Render the details page with the bike data
  } catch (error) {
    console.error('Error fetching bike details:', error);
    res.status(500).send('Error fetching bike details');
  }
});


app.get('/admin/view-trips', async (req, res) => {
  if (!req.session.admin) return res.redirect("/login");  // Ensure only admins can view trips

  try {
    const trips = await Trip.find();  // Fetch all trips from the database
    res.render('viewTrips', { trips });  // Render the trips page, passing the trips data
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).send("Error fetching trips");
  }
});

// View trip details (for Admin)
app.get('/admin/view-trip/:id', async (req, res) => {
  const tripId = req.params.id;
  try {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).send("Trip not found");
    }
    res.render('viewTripDetails', { trip }); // Render the details page with the trip data
  } catch (error) {
    console.error("Error fetching trip details:", error);
    res.status(500).send("Error fetching trip details");
  }
});


app.get('/admin/update-trip/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    // Ensure the trip is found from the database
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).send('Trip not found');
    }
    // Pass the trip data to the view
    res.render('updateTripForm', { trip });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});



app.post('/admin/update-trip/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    const { title, description, price, startDate, endDate, imageUrl, totalSeats, numberOfSeatsLeft } = req.body;
    
    // Find and update the trip
    const updatedTrip = await Trip.findByIdAndUpdate(tripId, {
      title,
      description,
      price,
      startDate,
      endDate,
      imageUrl,
      totalSeats,
      numberOfSeatsLeft
    }, { new: true });

    if (!updatedTrip) {
      return res.status(404).send('Trip not found');
    }

    // Redirect back to the trips list or show a success message
    res.redirect('/admin/view-trips');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});



app.post('/admin/delete-bike/:id', async (req, res) => {
  const bikeId = req.params.id;

  try {
    // Validate the bikeId
    if (!bikeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).send("Invalid bike ID format");
    }

    // Delete the bike from the database
    await Bike.findByIdAndDelete(bikeId);

    // Redirect back to the bikes view page
    res.redirect('/admin/view-bikes');
  } catch (error) {
    console.error("Error deleting bike:", error);
    res.status(500).send("An error occurred while deleting the bike.");
  }
});

app.get('/admin/delete-trip/:id', async (req, res) => {
  const tripId = req.params.id;

  try {
    // Validate the tripId
    if (!tripId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).send("Invalid trip ID format");
    }

    // Delete the trip from the database
    await Trip.findByIdAndDelete(tripId);

    // Redirect back to the trips view page
    res.redirect('/admin/view-trips');
  } catch (error) {
    console.error("Error deleting trip:", error);
    res.status(500).send("An error occurred while deleting the trip.");
  }
});

// server.js or routes file
app.post('/admin/delete-trip/:id', async (req, res) => {
  try {
    const tripId = req.params.id;
    const trip = await Trip.findByIdAndDelete(tripId);
    if (!trip) {
      return res.status(404).send('Trip not found');
    }
    res.redirect('/admin/view-trips');  // Redirect back to the list of trips
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});



app.get('/admin/view-bikes', async (req, res) => {
  try {
    const bikes = await Bike.find(); // Assuming `Bike` is your model
    res.render('viewBikes', { bikes });
  } catch (error) {
    console.error("Error fetching bikes:", error);
    res.status(500).send("Error fetching bikes");
  }
});


// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
