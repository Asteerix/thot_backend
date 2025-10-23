const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send email
 * @param {Object} options - Email options
 * @returns {Promise<Boolean>}
 */
const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@thot.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

/**
 * Send verification email
 * @param {String} email - User email
 * @param {String} token - Verification token
 * @returns {Promise<Boolean>}
 */
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  const html = `
    <h1>Email Verification</h1>
    <p>Please click the link below to verify your email:</p>
    <a href="${verificationUrl}">Verify Email</a>
    <p>Or copy this link: ${verificationUrl}</p>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify Your Email - THOT',
    html
  });
};

/**
 * Send password reset email
 * @param {String} email - User email
 * @param {String} token - Reset token
 * @returns {Promise<Boolean>}
 */
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const html = `
    <h1>Password Reset</h1>
    <p>You requested a password reset. Click the link below to reset your password:</p>
    <a href="${resetUrl}">Reset Password</a>
    <p>Or copy this link: ${resetUrl}</p>
    <p>If you didn't request this, please ignore this email.</p>
  `;

  return sendEmail({
    to: email,
    subject: 'Password Reset - THOT',
    html
  });
};

/**
 * Send welcome email
 * @param {String} email - User email
 * @param {String} name - User name
 * @returns {Promise<Boolean>}
 */
const sendWelcomeEmail = async (email, name) => {
  const html = `
    <h1>Welcome to THOT, ${name}!</h1>
    <p>We're excited to have you on board.</p>
    <p>Start exploring and connecting with our community.</p>
    <a href="${process.env.FRONTEND_URL}">Go to THOT</a>
  `;

  return sendEmail({
    to: email,
    subject: 'Welcome to THOT',
    html
  });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
};
