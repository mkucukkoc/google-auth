const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    version: 'v1'
  });
});

// Test API v1 endpoints
app.post('/api/v1/auth/register', (req, res) => {
  res.json({
    success: false,
    error: {
      code: 'email_already_registered',
      message: 'An account with this email already exists'
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1'
    }
  });
});

app.post('/api/v1/auth/login', (req, res) => {
  res.json({
    success: false,
    error: {
      code: 'invalid_credentials',
      message: 'Invalid email or password'
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1'
    }
  });
});

// Legacy endpoints for backward compatibility
app.post('/auth/register', (req, res) => {
  res.json({
    success: false,
    error: {
      code: 'email_already_registered',
      message: 'An account with this email already exists'
    }
  });
});

app.post('/auth/login', (req, res) => {
  res.json({
    success: false,
    error: {
      code: 'invalid_credentials',
      message: 'Invalid email or password'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`📡 API v1 endpoints available at /api/v1/`);
  console.log(`🔄 Legacy endpoints available at /auth/`);
  console.log(`🌐 Accessible from: http://localhost:${PORT} or http://192.168.1.107:${PORT}`);
});
