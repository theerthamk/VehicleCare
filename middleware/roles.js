// Allows a route only for the listed roles. Use after requireAuth.
//   router.post('/', requireRole('owner'), handler)
function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) {
      return res.status(401).json({ error: 'Please log in to continue.' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this.' });
    }
    next();
  };
}

module.exports = { requireRole };
