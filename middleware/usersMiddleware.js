import dotenv from "dotenv"
dotenv.config()
import jwt from "jsonwebtoken"
// secret jwt token
const jwtSecret = process.env.JWTSECRETUSERAPP;

// fetch user function
const usersMiddleware = async (req, res, next) => {
  try {
    console.log("jwtsecret===", jwtSecret);
    const token = req.header("authToken");
    // if token is empty
    if (!token) {
      console.log("token is not valid access denied");
      return res
      .status(401)
      .json({ error: "token is not valid access denied" });
    }
    
    // verify jwt token
    jwt.verify(token, jwtSecret, async function (err, decoded) {
      // check if token is invalid
      if (err) {
        return res
        .status(401)
          .json({ error: "token is not valid access denied" });
      } else {
        req.user = decoded;
        next();
      }
    });
  } catch (error) {
    // error handling
    return res.status(401).json({ error: "token is not valid access denied" });
  }
};

export default usersMiddleware;