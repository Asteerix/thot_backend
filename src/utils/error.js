exports.handleError = (error) => {
  console.warn('Error:', error);

  // Just log the error, let the controller handle the response
  if (error.name === 'ValidationError') {
    console.warn('Validation Error:', Object.values(error.errors).map(e => e.message));
  } else if (error.name === 'CastError') {
    console.warn('Invalid ID format');
  } else if (error.code === 11000) {
    console.warn('Duplicate field value entered');
  } else {
    console.warn('Internal Server Error:', error.message);
  }
};

exports.formatErrorResponse = (error) => {
  if (error.name === 'ValidationError') {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Validation Error',
        errors: Object.values(error.errors).map(e => e.message)
      }
    };
  }

  if (error.name === 'CastError') {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Invalid ID format'
      }
    };
  }

  if (error.code === 11000) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Duplicate field value entered'
      }
    };
  }

  return {
    status: error.status || 500,
    body: {
      success: false,
      message: error.message || 'Internal Server Error'
    }
  };
};
