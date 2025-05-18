import express from "express"
import { bookFlight, flightOffers, getBookings, getToken, login, register } from "../controller/userController.js"
import usersMiddleware from "../middleware/usersMiddleware.js"
const userRouter = express.Router()
userRouter.route("/getToken").post(getToken)
userRouter.route("/flightOffers").post(flightOffers)
userRouter.route("/bookFlight").post(bookFlight)
userRouter.route("/register").post(register)
userRouter.route("/login").post(login)
userRouter.route("/getBookings").get(usersMiddleware,getBookings)





export default userRouter
