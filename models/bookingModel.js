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
        checkedBags: {
            type: Number,
            required: true
        },
        cabinBags: {
            type: Number,
            required: true
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'waiting', 'confirmed', 'finished', 'failed'],
            default: 'pending'
        },
        paymentId: {
            type: String
        },
 
        orderId: {
            type: String
        },
        travelClass: {
            type: String,
            enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
            required: true
        },
        adults: {
            type: Number,

        },
        infants: {
            type: Number,

        },
        children: {
            type: Number,

        },
        departureDate: {
            type: Date,
            required: true
        },
        returnDate: {
            type: Date,

        },
        departureAirline: {
            type: String,
            required: true
        },
        returnAirline: {
            type: String,

        },
        fullName: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        phoneNumber: {
            type: Number,
            required: true
        },
        countryCode: {
            type: Number,
            // required: true
        },
            paymentMethod: {
            type: String
        },
        dateOfBirth: { type: Date, required: true },
        gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
        nationality: { type: String, required: true },
        passportNumber: { type: String, },
        seatPreference: { type: String, enum: ['Window', 'Aisle', 'Middle'] },
        mealPreference: { type: String, enum: ['Veg', 'Non-Veg', 'Halal', 'No Meal'], },
        extraBaggageAddOns: { type: String, },
        currencyCode: { type: String, }

    },
    {
        timestamps: true
    }
);

// Create User model
const bookingModel = mongoose.model("booking", bookingSchema);
export default bookingModel
