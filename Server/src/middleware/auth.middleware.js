const { getAuth } = require('@clerk/express');

const requireAuth = ({ allowInternal = false } = {}) => {
  return (req, res, next) => {
    // If internal service call is explicitly permitted and present, bypass Clerk auth
    if (allowInternal && req.headers['x-internal-call'] === 'true') {
      return next();
    }

    try {
      if (process.env.CLERK_SECRET_KEY) {
        const auth = getAuth(req);
        if (auth?.userId) {
          req.auth = auth;
          req.userId = auth.userId;
          return next();
        }
      }
    } catch (error) {
      console.warn("[Auth] Check warning:", error.message);
    }

    // Fallback for preview / dev environments without Clerk credentials
    if (!process.env.CLERK_SECRET_KEY) {
      req.auth = { userId: "user_mock_candidate" };
      req.userId = "user_mock_candidate";
      return next();
    }

    return res.status(401).json({ success: false, message: 'Unauthorized' });
  };
};

module.exports = { requireAuth };
