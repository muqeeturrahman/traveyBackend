import mongoose from "mongoose";
const { Schema } = mongoose;

const bookingSchema = Schema(
    {
        from: {
            type: String,
            required: true
        },
        to: {
            type: String,
            required: true

        },
        price: {
            type: Number,
            required: true
        },
        date: {
            type: Date,
            required: true

        },
        time: {
            type: Date,
            required: true

        },
        duration: {
            type: String,
            required: true

        },
        stops: {
            type: Number,
            required: true

        },
        airline: {
            type: String,
            required: true

        },
        travelClass: {
            type: String,
            required: true

        },
        checkedBags: {
            type: Number,
            required: true

        },
        cabinBags: {
            type: Number,
            required: true

        },
    },
    {
        timestamps: true, // This will add createdAt and updatedAt field
    }
);

// Create User model
const bookingModel = mongoose.model("booking", bookingSchema);
export default bookingModel
