const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const User = await User.create({ name, email, password });
    const token = jwt.sign({ id: User._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, User: { id: User._id, name, email } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const User = await User.findOne({ email });
    if (!User || !(await User.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: User._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, User: { id: User._id, name: User.name, email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;