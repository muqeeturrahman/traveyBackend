import express from "express"
import { bookFlight, flightOffers, getToken } from "../controller/userController.js"

const userRouter = express.Router()
userRouter.route("/getToken").post(getToken)
userRouter.route("/flightOffers").post(flightOffers)
userRouter.route("/bookFlight").post(bookFlight)


export default userRouter
