const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow-super-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signToken, verifyToken, requireAuth, JWT_SECRET };
