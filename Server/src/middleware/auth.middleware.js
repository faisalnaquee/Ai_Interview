const { getAuth } = require('@clerk/express');

const requireAuth = ({ allowInternal = false } = {}) => {
  return (req, res, next) => {
    // If internal service call is explicitly permitted and present, bypass Clerk auth
    if (allowInternal && req.headers['x-internal-call'] === 'true') {
      return next();
    }

    try {
      const auth = getAuth(req);
      if (!auth?.userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      // Attach to req so downstream controllers can use req.auth.userId
      req.auth = auth;
      req.userId = auth.userId;
      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  };
};

module.exports = { requireAuth };
