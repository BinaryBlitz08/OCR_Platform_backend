require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const ocrRoutes = require('./routes/ocrRoutes');

const app = express();

// Allow frontend on 4200
app.use(cors({
  origin: 'http://localhost:4200'
}));

app.use(express.json());

// DEBUG: Log all incoming requests and headers
app.use(cors({
  origin: 'http://localhost:4200',  // Your frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],  // ← Critical!
  credentials: false  // Not needed for JWT
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ocr', ocrRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URL)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Error:', err));

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));