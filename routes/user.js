import express from "express"
import { bookFlight, flightOffers, getBookings, getToken, login, register,discountPercentage, getDiscount, getBookingById, logout, deleteBookingById, confirmPayment, city, verifyOtp, forgetPassword, verifyForgetPassword, resetPassword, createDeal, getDeals, getDealById } from "../controller/userController.js"
import usersMiddleware from "../middleware/usersMiddleware.js"
const userRouter = express.Router()
userRouter.route("/getToken").post(getToken)
userRouter.route("/flightOffers").get(flightOffers)
userRouter.route("/bookFlight").post(bookFlight)
userRouter.route("/confirmPayment").post(confirmPayment)
userRouter.route("/register").post(register)
userRouter.route("/verifyOtp").post(verifyOtp)
userRouter.route("/forgetPassword").post(forgetPassword)
userRouter.route("/verifyForgetPassword").post(verifyForgetPassword)
userRouter.route("/resetPassword").post(resetPassword)


userRouter.route("/login").post(login)
userRouter.route("/getBookings").get(usersMiddleware,getBookings)
userRouter.route("/discount").post(usersMiddleware,discountPercentage)
userRouter.route("/getDiscountPercentages").get(usersMiddleware,getDiscount)
userRouter.route("/getBookingById/:id").get(usersMiddleware,getBookingById)
userRouter.route("/logout").post(usersMiddleware,logout)
userRouter.route("/cities").get(city)

userRouter.route("/deleteBookingById/:id").post(usersMiddleware,deleteBookingById)

userRouter.route("/getDeals").get(getDeals)
userRouter.route("/createDeal").post(createDeal)
userRouter.route("/getDealById/:id").get(getDealById)






export default userRouter
