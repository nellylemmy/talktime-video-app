export const isAdmin = (req, res, next) => {
    console.log('isAdmin middleware - JWT User:', req.user);
    
    if (req.user && req.user.role === 'admin') {
        console.log('Admin authenticated, proceeding');
        return next();
    }
    
    console.log('Not authenticated as admin, access denied');
    return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
};

export const isAuthenticated = (req, res, next) => {
    console.log('=== isAuthenticated middleware START ===');
    console.log('Request URL:', req.originalUrl);
    console.log('Request Method:', req.method);
    console.log('JWT User:', req.user);
    
    if (req.user) {
        console.log('User authenticated via JWT, proceeding');
        return next();
    }
    
    console.log('Not authenticated, no JWT user found');
    // For API requests, return 401 instead of redirecting
    // Check for API requests by looking at the originalUrl which includes the full path
    if (req.headers['content-type'] === 'application/json' || 
        req.originalUrl.includes('/api/') || 
        req.xhr || 
        req.headers.accept === 'application/json') {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    // If not authenticated, redirect to the appropriate login page
    res.redirect('/volunteer/login.html');
};


