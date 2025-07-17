import dotenv from "dotenv";
dotenv.config();
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import http from "http";
import cors from "cors";
import userRouter from "./routes/user.js";
import paypalRouter from './routes/paypal.js';

// import { userRouter } from "./routes/user.js";

console.log(process.env.AMADEUS_CLIENT_ID);


console.log(process.env.LOCALDB);

const app = express();
const server = http.createServer(app);



const port = process.env.PORT || 5000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json())
app.use(cors({
  origin: '*'
}));


app.use("/uploads/userProfile/", express.static("uploads/userProfile/"));


// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const logEndpoint = (req, res, next) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  console.log(`Endpoint Hit: ${baseUrl}/${req.originalUrl}`);
  next(); // Move to the next middleware or route handler
};

app.use(logEndpoint);

// Routes
app.get('/',(req,res,next)=>{
  res.json({
    success:true,
    message:"Welcome to Travey Backend"
  })
})
app.use("/api/user", userRouter);
app.use('/api/paypal', paypalRouter);


mongoose
  .connect(process.env.LOCALDB)
  .then(() => {
    console.log("connected to mongodb");
    server.listen(port, () => {
      console.log("Listening on port " + port);
    });
  })
  .catch((err) => {
    console.error("could not connect to mongodb", err.message);
  });
