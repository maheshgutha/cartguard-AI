import jwt from "jsonwebtoken";

export const generateToken = (id, role) => {
  const secret = process.env.JWT_SECRET || "cartguard_jwt_default_secret_key_2026";
  return jwt.sign({ id, role }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

export default generateToken;
