import jwt from "jsonwebtoken"; // renamed for consistency with common practice
import nodemailer from "nodemailer"
export const generateToken = (user) => {
  if (!user || !user._id || !user.email || !user.role) {
    throw new Error("Invalid user object provided for token generation.");
  }

  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRATION || "7h", // fallback
  });

  return token;
};


export const sendEmail = async (email, subject, message) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true, // true for port 465, false for port 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // <-- allows self-signed certificates
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject,
    text: message,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw error; // rethrow to handle it in caller if needed
  }
};
