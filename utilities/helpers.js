import jwt from "jsonwebtoken"; // renamed for consistency with common practice

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
