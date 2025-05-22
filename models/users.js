import mongoose from "mongoose";
const { Schema } = mongoose;

const usersSchema = Schema(
  {
    fullName: {
      type: String,
    },
  email: {
      type: String,
    },
    countryCode: {
      type: Number,
    },
    phoneNumber: {
      type: Number,
     
      
    },
    password: {
      type: String,
      required: true,

    },
    otpCode: {
      type: Number,
    },
    avatar: {
      type: String,
    },

    // countryCode: {
    //   type: String,
    //   required: true,
    // },
    isOtpVerified: {
      type: Boolean,
      default: 0,
    },
        isForgetPasswordVerifiied: {
      type: Boolean,
      default: 0,
    },
    role: {
      type: String,
        enum: ['admin','user'],
    },
    isBlocked: {
      type: Boolean,
    },
 
    isNotification: {
      type: Boolean,
      default: 1,
    },
    authToken: {
      type: String,
    },
    isAdmin: {
      type: Boolean,
    },
    status: {
      type: Boolean,
      default: 1,
    },
    resetPasswordCount: {
      type: Number,
    },
    lastLogin: {
      type: Date,
    },
    lastLogout: {
      type: Date,
    },
    isTermsAndCondition: {
      type: Boolean,
      // required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isOtpExpire: {
      type: Boolean,
      default: false,
      required: true,
    },
    otpGenerateTimeDate: {
      type: Date,
    },
    isProfileCreated: {
      type: Boolean,
      default: false,
    },
    devices: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Device",
      },
    ],
  },
  {
    timestamps: true, // This will add createdAt and updatedAt field
  }
);

// Create User model
const usersModel = mongoose.model("users", usersSchema);
export default usersModel
