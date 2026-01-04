// middleware/auth.js

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // Express lowercases headers — use lowercase key
  const authHeader = req.headers['authorization'];

  console.log('Auth header in middleware:', authHeader);  // ← Debug

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};