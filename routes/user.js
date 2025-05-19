import express from "express"
import { bookFlight, flightOffers, getBookings, getToken, login, register,discountPercentage, getDiscount, getBookingById, logout, deleteBookingById } from "../controller/userController.js"
import usersMiddleware from "../middleware/usersMiddleware.js"
const userRouter = express.Router()
userRouter.route("/getToken").post(getToken)
userRouter.route("/flightOffers").post(flightOffers)
userRouter.route("/bookFlight").post(bookFlight)
userRouter.route("/register").post(register)
userRouter.route("/login").post(login)
userRouter.route("/getBookings").get(usersMiddleware,getBookings)
userRouter.route("/discount").post(usersMiddleware,discountPercentage)
userRouter.route("/getDiscountPercentages").get(usersMiddleware,getDiscount)
userRouter.route("/getBookingById/:id").get(usersMiddleware,getBookingById)
userRouter.route("/logout").post(usersMiddleware,logout)

userRouter.route("/deleteBookingById/:id").post(usersMiddleware,deleteBookingById)







export default userRouter
