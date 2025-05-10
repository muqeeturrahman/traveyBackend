import mongoose from "mongoose";
const { Schema } = mongoose;

const bookingSchema = Schema(
    {
        from: {
            type: String,
        },
        to: {
            type: String,
        },
        date: {
            type: Date
        },
       time:{
        type:Date,
       },
         duration: {
            type: String,
        },
          stops: {
            type: Number,
        },
          airline: {
            type: String,
        },
          class: {
            type: String,
        },

    },
    {
        timestamps: true, // This will add createdAt and updatedAt field
    }
);

// Create User model
const usersModel = mongoose.model("users", usersSchema);
export default usersModel
