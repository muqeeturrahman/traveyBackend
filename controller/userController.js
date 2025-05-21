import express from "express"
import axios from "axios"
import dotenv from "dotenv"
import tokenModel from "../models/token.js"
import bookingModel from "../models/bookingModel.js"
import usersModel from "../models/users.js"
import { hash, compare } from "bcrypt"
import { generateToken } from "../utilities/helpers.js"
import DiscountModel from "../models/discountModel.js"
import NodeCache from "node-cache";
import { v4 as uuidv4 } from 'uuid';
import { log } from "node:console"

dotenv.config()

const getAccessToken = async () => {
  const tokenData = await tokenModel.findOne({}).sort({ updatedAt: -1 }); // Using updatedAt now
  console.log(tokenData, "token>>>>>>>>>>>>");

  if (!tokenData) {
    throw new Error("No token found");
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const updatedAtInSeconds = Math.floor(new Date(tokenData.updatedAt).getTime() / 1000);
  const expiryTime = updatedAtInSeconds + tokenData.expiresAt;

  console.log({
    nowInSeconds,
    updatedAtInSeconds,
    expiryTime,
    secondsUntilExpiry: expiryTime - nowInSeconds,
  });

  if (tokenData.access_token && expiryTime > nowInSeconds) {
    console.log("✅ Reusing valid token");
    return tokenData.access_token;
  } else {
    console.log("🔄 Token expired or missing, fetching new token...");

    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const newAccessToken = response.data.access_token;
    const newExpiresIn = response.data.expires_in;

    // Update token in DB and let Mongoose auto-update updatedAt
    await tokenModel.findByIdAndUpdate(tokenData._id, {
      access_token: newAccessToken,
      expiresAt: newExpiresIn,
    });

    return newAccessToken;
  }
};
const flightCache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

// export const flightOffers = async (req, res, next) => {
//   try {

//     const {
//       originLocationCode,
//       destinationLocationCode,
//       departureDate,
//       adults,
//       max = 100,
//       returnDate,
//       children,
//       infants,
//       travelClass,
    
//     } = req.body;
//     console.log(req.body,"req.body>>>>>>>>>>>>>");
    
//     const page=req.body.page || 1
//     const limit=req.body.limit || 10
//     // Create a stable, clean cache key
//     const keyPayload = {
//       originLocationCode,
//       destinationLocationCode,
//       departureDate,
//       adults: adults || 1,
//       ...(returnDate && { returnDate }),
//       ...(children && { children }),
//       ...(infants && { infants }),
//       ...(travelClass && { travelClass }),
//       max,
//     };
//     const cacheKey = JSON.stringify(keyPayload);

//     let allOffers = flightCache.get(cacheKey);

//     if (!allOffers) {
//       console.log("⛔ Cache MISS: calling Amadeus API");

//       const token = await getAccessToken();

//       const response = await axios.get(
//         "https://test.api.amadeus.com/v2/shopping/flight-offers",
//         {
//           params: {
//             originLocationCode,
//             destinationLocationCode,
//             departureDate,
//             adults: adults || 1,
//             currencyCode: "USD",
//             max,
//             ...(returnDate && { returnDate }),
//             ...(children && { children }),
//             ...(infants && { infants }),
//             ...(travelClass && { travelClass }),
//           },
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       allOffers = response.data.data || [];
//       flightCache.set(cacheKey, allOffers); // Cache the result
//       console.log("✅ Response cached.");
//     } else {
//       console.log("✅ Cache HIT: served from cache");
//     }

//     // Pagination logic
//     const total = allOffers.length;
//     const pageInt = parseInt(page);
//     const limitInt = parseInt(limit);
//     const startIndex = (pageInt - 1) * limitInt;
//     const endIndex = startIndex + limitInt;
//     const paginatedData = allOffers.slice(startIndex, endIndex);

//     return res.status(200).json({
//       success: true,
//       message: "Flight offers fetched successfully",
//       data: { data: paginatedData },
//       meta: {
//         total,
//         page: pageInt,
//         limit: limitInt,
//         totalPages: Math.ceil(total / limitInt),
//         fromCache: !!allOffers,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Error in flightOffers:", error.message);

//     if (error.response) {
//       return res.status(error.response.status).json({
//         success: false,
//         error: error.response.data,
//         message: error.response.statusText,
//       });
//     } else {
//       return res.status(500).json({
//         success: false,
//         error: error.message,
//         message: "Server error while fetching flight offers",
//       });
//     }
//   }
// };
export const flightOffers = async (req, res, next) => {
  try {
    const discount = await DiscountModel.findOne({}).sort({ createdAt: -1 })



    const {
      originLocationCode,
      destinationLocationCode,
      departureDate,
      adults,
      max = 100,
      returnDate,
      children,
      infants,
      travelClass,
      currencyCode

    } = req.query;
    console.log(req.query,">>>>>>.")
 
    const page = req.query.page || 1
    const limit = req.query.limit | 10

    // Create a stable, clean cache key
    const keyPayload = {
      originLocationCode,
      destinationLocationCode,
      departureDate,
      adults: adults || 1,
      ...(returnDate && { returnDate }),
      ...(children && { children }),
      ...(infants && { infants }),
      ...(travelClass && { travelClass }),
      max,
    };
    const cacheKey = JSON.stringify(keyPayload);

    let allOffers = flightCache.get(cacheKey);

    if (!allOffers) {
      console.log("⛔ Cache MISS: calling Amadeus API");

      const token = await getAccessToken();

      const response = await axios.get(
        "https://test.api.amadeus.com/v2/shopping/flight-offers",
        {
          params: {
            originLocationCode,
            destinationLocationCode,
            departureDate,
            adults: adults || 1,
            currencyCode: currencyCode,
            max,
            ...(returnDate && { returnDate }),
            ...(children && { children }),
            ...(infants && { infants }),
            ...(travelClass && { travelClass }),
          },
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      allOffers = response.data.data || [];
      flightCache.set(cacheKey, allOffers); // Cache the result
      console.log("✅ Response cached.");
    } else {
      console.log("✅ Cache HIT: served from cache");
    }

    // Pagination logic
    const total = allOffers.length;
    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const startIndex = (pageInt - 1) * limitInt;
    const endIndex = startIndex + limitInt;
    const paginatedData = allOffers.slice(startIndex, endIndex);

    return res.status(200).json({
      success: true,
      message: "Flight offers fetched successfully",
      data: { data: paginatedData, flightDiscount: discount.flightDiscount },
      meta: {
        total,
        page: pageInt,
        limit: limitInt,
        totalPages: Math.ceil(total / limitInt),
        fromCache: !!allOffers,
      },
    });
  } catch (error) {
    console.error("❌ Error in flightOffers:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data,
        message: error.response.statusText,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message,
        message: "Server error while fetching flight offers",
      });
    }
  }
};
export const getToken = async (req, res, next) => {
  try {
    const tokenData = await tokenModel.findOne({}).sort({ createdAt: -1 });

    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: "No token found",
      });
    }

    const nowInSeconds = Math.floor(Date.now() / 1000); // Convert to seconds
    const createdAtInSeconds = Math.floor(new Date(tokenData.createdAt).getTime() / 1000);
    const expiryTime = createdAtInSeconds + tokenData.expiresAt;

    if (tokenData.access_token && expiryTime > nowInSeconds) {
      return res.status(200).json({
        data: tokenData,
        success: true,
        message: "token",
      });
    } else {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }
  } catch (error) {
    next(error);
  }
};

export const bookFlight = async (req, res, next) => {
  try {
    const {
      from,
      to,
      price,
      date,
      time,
      duration,
      stops,
      travelClass,
      checkedBags,
      cabinBags,
      paymentStatus,
      paymentId,
      adults,
      infants,
      children,
      departureDate,
      returnDate,
      departureAirline,
      returnAirline,
      fullName,
      email,
      phoneNumber,
      countryCode
    } = req.body;

    const flightDate = new Date(date);
    const flightTime = new Date(time);
    const orderId = `ORDER-${uuidv4()}`;


    // Build base booking data
    const bookingData = {
      from,
      to,
      price,
      date: flightDate,
      time: flightTime,
      duration,
      stops,
      travelClass,
      checkedBags,
      cabinBags,
      paymentStatus: paymentStatus || "pending",
      departureDate,
      departureAirline,
      fullName,
      email,
      phoneNumber,
      countryCode
    };

    // Conditionally add optional fields
    if (paymentId) bookingData.paymentId = paymentId;
    if (adults !== undefined) bookingData.adults = adults;
    if (infants !== undefined) bookingData.infants = infants;
    if (children !== undefined) bookingData.children = children;
    if (returnDate) bookingData.returnDate = returnDate;
    if (returnAirline) bookingData.returnAirline = returnAirline;

    // Create initial booking
    const booking = await bookingModel.create(bookingData);

    // Call NOWPayments to create invoice
    const nowRes = await axios.post(
      "https://api.nowpayments.io/v1/invoice",
      {
        price_amount: price,
        price_currency: "aud",
        pay_currency: "btc",
        order_id: orderId,
        ipn_callback_url: "https://travey-backend.vercel.app/api/user/confirmPayment",
        success_url: "https://yourdomain.com/payment-success",
        cancel_url: "https://yourdomain.com/payment-cancel"
      },
      {
        headers: {
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );  

    console.log("NOWPayments response:", nowRes.data);

    // Update booking with payment details
    booking.paymentId = nowRes.data.payment_id;
    booking.paymentStatus = nowRes.data.payment_status || "waiting";
    booking.orderId = orderId;
    await booking.save();

    // Send response
    res.status(201).json({
      success: true,
      message: "Flight booked, awaiting payment",
      data: {
        booking,
        payment_url: nowRes.data.invoice_url
      }
    });

  } catch (error) {
    console.error("Booking or payment error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Booking failed",
      error: error.response?.data || error.message
    });
  }
};
export const confirmPayment = async (req, res, next) => {
  try {
    const { order_id, payment_status } = req.body;
console.log(req.body,"body>>>>>>>>.");

    if (!order_id || payment_status !== 'finished') {
      return res.status(400).json({ success: false, message: 'Invalid or incomplete payment data' });
    }

    const booking = await bookingModel.findOne({ orderId: order_id });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    booking.paymentStatus = 'confirmed';
    await booking.save();

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
    });
  } catch (error) {
    console.error('IPN error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Payment confirmation failed',
      error: error.message
    });
  }
};


// export const flightOffers = async (req, res, next) => {
//   try {
//     // ✅ Get valid token (will refresh if needed)
//     // const token = await getAccessToken();
//     // console.log("✅ Token used:", token);

//     // const { originLocationCode, destinationLocationCode, departureDate, adults, max } = req.body;
//     // console.log(originLocationCode, ">>>>>>");

//     // const response = await axios.get(
//     //   "https://test.api.amadeus.com/v2/shopping/flight-offers",
//     //   {
//     //     params: {
//     //       originLocationCode,
//     //       destinationLocationCode,
//     //       departureDate,
//     //       adults: adults || 1,
//     //       currencyCode: "USD",
//     //       max,
//     //     },
//     //     headers: {
//     //       Authorization: `Bearer ${token}`,
//     //       "Content-Type": "application/json",
//     //     },
//     //   }
//     // );
// let data={
//     "data": {
//         "meta": {
//             "count": 5,
//             "links": {
//                 "self": "https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=SYD&destinationLocationCode=NYC&departureDate=2025-05-25&adults=3&currencyCode=USD&max=5"
//             }
//         },
//         "data": [
//             {
//                 "type": "flight-offer",
//                 "id": "1",
//                 "source": "GDS",
//                 "instantTicketingRequired": false,
//                 "nonHomogeneous": false,
//                 "oneWay": false,
//                 "isUpsellOffer": false,
//                 "lastTicketingDate": "2025-05-25",
//                 "lastTicketingDateTime": "2025-05-25",
//                 "numberOfBookableSeats": 9,
//                 "itineraries": [
//                     {
//                         "duration": "PT27H30M",
//                         "segments": [
//                             {
//                                 "departure": {
//                                     "iataCode": "SYD",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T09:30:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "ICN",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T19:00:00"
//                                 },
//                                 "carrierCode": "OZ",
//                                 "number": "602",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "OZ"
//                                 },
//                                 "duration": "PT10H30M",
//                                 "id": "5",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             },
//                             {
//                                 "departure": {
//                                     "iataCode": "ICN",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T21:05:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "JFK",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T23:00:00"
//                                 },
//                                 "carrierCode": "OZ",
//                                 "number": "224",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "OZ"
//                                 },
//                                 "duration": "PT14H55M",
//                                 "id": "6",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             }
//                         ]
//                     }
//                 ],
//                 "price": {
//                     "currency": "USD",
//                     "total": "2570.43",
//                     "base": "1821.00",
//                     "fees": [
//                         {
//                             "amount": "0.00",
//                             "type": "SUPPLIER"
//                         },
//                         {
//                             "amount": "0.00",
//                             "type": "TICKETING"
//                         }
//                     ],
//                     "grandTotal": "2570.43"
//                 },
//                 "pricingOptions": {
//                     "fareType": [
//                         "PUBLISHED"
//                     ],
//                     "includedCheckedBagsOnly": true
//                 },
//                 "validatingAirlineCodes": [
//                     "OZ"
//                 ],
//                 "travelerPricings": [
//                     {
//                         "travelerId": "1",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "856.81",
//                             "base": "607.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "5",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "KLOOU",
//                                 "class": "K",
//                                 "includedCheckedBags": {
//                                     "quantity": 2
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 }
//                             },
//                             {
//                                 "segmentId": "6",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "KLOOU",
//                                 "class": "K",
//                                 "includedCheckedBags": {
//                                     "quantity": 2
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 }
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "2",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "856.81",
//                             "base": "607.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "5",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "KLOOU",
//                                 "class": "K",
//                                 "includedCheckedBags": {
//                                     "quantity": 2
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 }
//                             },
//                             {
//                                 "segmentId": "6",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "KLOOU",
//                                 "class": "K",
//                                 "includedCheckedBags": {
//                                     "quantity": 2
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 }
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "3",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "856.81",
//                             "base": "607.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "5",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "KLOOU",
//                                 "class": "K",
//                                 "includedCheckedBags": {
//                                     "quantity": 2
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 }
//                             },
//                             {
//                                 "segmentId": "6",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "KLOOU",
//                                 "class": "K",
//                                 "includedCheckedBags": {
//                                     "quantity": 2
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 }
//                             }
//                         ]
//                     }
//                 ]
//             },
//             {
//                 "type": "flight-offer",
//                 "id": "2",
//                 "source": "GDS",
//                 "instantTicketingRequired": false,
//                 "nonHomogeneous": false,
//                 "oneWay": false,
//                 "isUpsellOffer": false,
//                 "lastTicketingDate": "2025-05-25",
//                 "lastTicketingDateTime": "2025-05-25",
//                 "numberOfBookableSeats": 9,
//                 "itineraries": [
//                     {
//                         "duration": "PT27H",
//                         "segments": [
//                             {
//                                 "departure": {
//                                     "iataCode": "SYD",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T07:35:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T15:05:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "110",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT9H30M",
//                                 "id": "1",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             },
//                             {
//                                 "departure": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T16:15:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "JFK",
//                                     "terminal": "8",
//                                     "at": "2025-05-25T20:35:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "840",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT16H20M",
//                                 "id": "2",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             }
//                         ]
//                     }
//                 ],
//                 "price": {
//                     "currency": "USD",
//                     "total": "2590.53",
//                     "base": "1611.00",
//                     "fees": [
//                         {
//                             "amount": "0.00",
//                             "type": "SUPPLIER"
//                         },
//                         {
//                             "amount": "0.00",
//                             "type": "TICKETING"
//                         }
//                     ],
//                     "grandTotal": "2590.53"
//                 },
//                 "pricingOptions": {
//                     "fareType": [
//                         "PUBLISHED"
//                     ],
//                     "includedCheckedBagsOnly": true
//                 },
//                 "validatingAirlineCodes": [
//                     "CX"
//                 ],
//                 "travelerPricings": [
//                     {
//                         "travelerId": "1",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "1",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "2",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "2",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "1",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "2",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "3",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "1",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "2",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     }
//                 ]
//             },
//             {
//                 "type": "flight-offer",
//                 "id": "3",
//                 "source": "GDS",
//                 "instantTicketingRequired": false,
//                 "nonHomogeneous": false,
//                 "oneWay": false,
//                 "isUpsellOffer": false,
//                 "lastTicketingDate": "2025-05-25",
//                 "lastTicketingDateTime": "2025-05-25",
//                 "numberOfBookableSeats": 9,
//                 "itineraries": [
//                     {
//                         "duration": "PT29H55M",
//                         "segments": [
//                             {
//                                 "departure": {
//                                     "iataCode": "SYD",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T14:05:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T21:30:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "100",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT9H25M",
//                                 "id": "7",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             },
//                             {
//                                 "departure": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-26T02:00:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "JFK",
//                                     "terminal": "8",
//                                     "at": "2025-05-26T06:00:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "844",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT16H",
//                                 "id": "8",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             }
//                         ]
//                     }
//                 ],
//                 "price": {
//                     "currency": "USD",
//                     "total": "2590.53",
//                     "base": "1611.00",
//                     "fees": [
//                         {
//                             "amount": "0.00",
//                             "type": "SUPPLIER"
//                         },
//                         {
//                             "amount": "0.00",
//                             "type": "TICKETING"
//                         }
//                     ],
//                     "grandTotal": "2590.53"
//                 },
//                 "pricingOptions": {
//                     "fareType": [
//                         "PUBLISHED"
//                     ],
//                     "includedCheckedBagsOnly": true
//                 },
//                 "validatingAirlineCodes": [
//                     "CX"
//                 ],
//                 "travelerPricings": [
//                     {
//                         "travelerId": "1",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "7",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "8",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "2",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "7",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "8",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "3",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "7",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "8",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     }
//                 ]
//             },
//             {
//                 "type": "flight-offer",
//                 "id": "4",
//                 "source": "GDS",
//                 "instantTicketingRequired": false,
//                 "nonHomogeneous": false,
//                 "oneWay": false,
//                 "isUpsellOffer": false,
//                 "lastTicketingDate": "2025-05-25",
//                 "lastTicketingDateTime": "2025-05-25",
//                 "numberOfBookableSeats": 9,
//                 "itineraries": [
//                     {
//                         "duration": "PT33H55M",
//                         "segments": [
//                             {
//                                 "departure": {
//                                     "iataCode": "SYD",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T10:05:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T17:35:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "162",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT9H30M",
//                                 "id": "9",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             },
//                             {
//                                 "departure": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-26T02:00:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "JFK",
//                                     "terminal": "8",
//                                     "at": "2025-05-26T06:00:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "844",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT16H",
//                                 "id": "10",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             }
//                         ]
//                     }
//                 ],
//                 "price": {
//                     "currency": "USD",
//                     "total": "2590.53",
//                     "base": "1611.00",
//                     "fees": [
//                         {
//                             "amount": "0.00",
//                             "type": "SUPPLIER"
//                         },
//                         {
//                             "amount": "0.00",
//                             "type": "TICKETING"
//                         }
//                     ],
//                     "grandTotal": "2590.53"
//                 },
//                 "pricingOptions": {
//                     "fareType": [
//                         "PUBLISHED"
//                     ],
//                     "includedCheckedBagsOnly": true
//                 },
//                 "validatingAirlineCodes": [
//                     "CX"
//                 ],
//                 "travelerPricings": [
//                     {
//                         "travelerId": "1",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "9",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "10",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "2",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "9",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "10",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "3",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "863.51",
//                             "base": "537.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "9",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "10",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     }
//                 ]
//             },
//             {
//                 "type": "flight-offer",
//                 "id": "5",
//                 "source": "GDS",
//                 "instantTicketingRequired": false,
//                 "nonHomogeneous": false,
//                 "oneWay": false,
//                 "isUpsellOffer": false,
//                 "lastTicketingDate": "2025-05-25",
//                 "lastTicketingDateTime": "2025-05-25",
//                 "numberOfBookableSeats": 9,
//                 "itineraries": [
//                     {
//                         "duration": "PT29H25M",
//                         "segments": [
//                             {
//                                 "departure": {
//                                     "iataCode": "SYD",
//                                     "terminal": "1",
//                                     "at": "2025-05-25T21:50:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-26T05:10:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "138",
//                                 "aircraft": {
//                                     "code": "359"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT9H20M",
//                                 "id": "3",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             },
//                             {
//                                 "departure": {
//                                     "iataCode": "HKG",
//                                     "terminal": "1",
//                                     "at": "2025-05-26T09:05:00"
//                                 },
//                                 "arrival": {
//                                     "iataCode": "JFK",
//                                     "terminal": "8",
//                                     "at": "2025-05-26T13:15:00"
//                                 },
//                                 "carrierCode": "CX",
//                                 "number": "830",
//                                 "aircraft": {
//                                     "code": "77W"
//                                 },
//                                 "operating": {
//                                     "carrierCode": "CX"
//                                 },
//                                 "duration": "PT16H10M",
//                                 "id": "4",
//                                 "numberOfStops": 0,
//                                 "blacklistedInEU": false
//                             }
//                         ]
//                     }
//                 ],
//                 "price": {
//                     "currency": "USD",
//                     "total": "2668.53",
//                     "base": "1689.00",
//                     "fees": [
//                         {
//                             "amount": "0.00",
//                             "type": "SUPPLIER"
//                         },
//                         {
//                             "amount": "0.00",
//                             "type": "TICKETING"
//                         }
//                     ],
//                     "grandTotal": "2668.53"
//                 },
//                 "pricingOptions": {
//                     "fareType": [
//                         "PUBLISHED"
//                     ],
//                     "includedCheckedBagsOnly": true
//                 },
//                 "validatingAirlineCodes": [
//                     "CX"
//                 ],
//                 "travelerPricings": [
//                     {
//                         "travelerId": "1",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "889.51",
//                             "base": "563.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "3",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "4",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "2",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "889.51",
//                             "base": "563.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "3",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "4",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     },
//                     {
//                         "travelerId": "3",
//                         "fareOption": "STANDARD",
//                         "travelerType": "ADULT",
//                         "price": {
//                             "currency": "USD",
//                             "total": "889.51",
//                             "base": "563.00"
//                         },
//                         "fareDetailsBySegment": [
//                             {
//                                 "segmentId": "3",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             },
//                             {
//                                 "segmentId": "4",
//                                 "cabin": "ECONOMY",
//                                 "fareBasis": "NR21AUKO",
//                                 "brandedFare": "ECONLIGHT",
//                                 "brandedFareLabel": "ECONOMY LIGHT",
//                                 "class": "N",
//                                 "includedCheckedBags": {
//                                     "quantity": 1
//                                 },
//                                 "includedCabinBags": {
//                                     "quantity": 1
//                                 },
//                                 "amenities": [
//                                     {
//                                         "description": "1PC MAX 23KG 158LCM EACH",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "1PC MAX 15LB 7KG 115LCM",
//                                         "isChargeable": false,
//                                         "amenityType": "BAGGAGE",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "SEAT ASSIGNMENT",
//                                         "isChargeable": true,
//                                         "amenityType": "PRE_RESERVED_SEAT",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "REFUNDABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "MILEAGE ACCRUAL",
//                                         "isChargeable": false,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     },
//                                     {
//                                         "description": "CHANGEABLE TICKET",
//                                         "isChargeable": true,
//                                         "amenityType": "BRANDED_FARES",
//                                         "amenityProvider": {
//                                             "name": "BrandedFare"
//                                         }
//                                     }
//                                 ]
//                             }
//                         ]
//                     }
//                 ]
//             }
//         ],
//         "dictionaries": {
//             "locations": {
//                 "ICN": {
//                     "cityCode": "SEL",
//                     "countryCode": "KR"
//                 },
//                 "HKG": {
//                     "cityCode": "HKG",
//                     "countryCode": "HK"
//                 },
//                 "JFK": {
//                     "cityCode": "NYC",
//                     "countryCode": "US"
//                 },
//                 "SYD": {
//                     "cityCode": "SYD",
//                     "countryCode": "AU"
//                 }
//             },
//             "aircraft": {
//                 "359": "AIRBUS A350-900",
//                 "77W": "BOEING 777-300ER"
//             },
//             "currencies": {
//                 "USD": "US DOLLAR"
//             },
//             "carriers": {
//                 "CX": "CATHAY PACIFIC",
//                 "OZ": "ASIANA AIRLINES"
//             }
//         }
//     },
//     "success": true,
//     "message": "Flight offers fetched successfully"
// }

//     return res.status(200).json({
//       // data: response.data,
//       ...data,
//       success: true,
//       message: "Flight offers fetched successfully",
//     });
//   } catch (error) {
//     console.error("❌ Error in flightOffers:", error.message);

//     if (error.response) {
//       return res.status(error.response.status).json({
//         success: false,
//         error: error.response.data,
//         message: error.response.statusText,
//       });
//     } else {
//       return res.status(500).json({
//         success: false,
//         error: error.message,
//         message: "Server error while fetching flight offers",
//       });
//     }
//   }
// };

export const register = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    const userExists = await usersModel.findOne({ email, isDeleted: false });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const hashedPassword = await hash(password, 10);

    const user = await usersModel.create({
      email,
      role,
      password: hashedPassword,
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: user
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await usersModel.findOne({ email, isDeleted: false });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Compare password
    const isMatch = await compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate JWT Token
    const token = generateToken(user)

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};
export const getBookings = async (req, res, next) => {
  try {
    // const { currentPage , itemsPerPage  } = req.query;
    const page = req.query.page || 1
    const limit = req.query.limit || 10
    const bookings = await bookingModel.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No bookings found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bookings fetched successfully',
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};



export const discountPercentage = async (req, res, next) => {
  try {
    const updateFields = {};

    // Only add fields that are present in the request body
    if (req.body.flightDiscount !== undefined) {
      updateFields.flightDiscount = req.body.flightDiscount;
    }
    if (req.body.hotelDiscount !== undefined) {
      updateFields.hotelDiscount = req.body.hotelDiscount;
    }
    if (req.body.carDiscount !== undefined) {
      updateFields.carDiscount = req.body.carDiscount;
    }

    // If nothing to update, return early
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No valid discount fields provided." });
    }

    // Find the existing discount document or create one if it doesn't exist
    let discount = await DiscountModel.findOne();

    if (!discount) {
      // Create new document with only the provided fields
      discount = await DiscountModel.create(updateFields);
    } else {
      // Update existing document with only the provided fields
      discount = await DiscountModel.findByIdAndUpdate(
        discount._id,
        { $set: updateFields },
        { new: true }
      );
    }

    res.status(200).json({
      message: "Discount updated successfully",
      data: discount,
    });
  } catch (error) {
    next(error);
  }
};

export const getDiscount = async (req, res, next) => {
  try {
    const discount = await DiscountModel.findOne({}).sort({ createdAt: -1 });

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'No discounts percentage found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'discount percentages fetched successfully',
      data: discount,
    });
  } catch (error) {
    next(error);
  }
};

export const getBookingById = async (req, res, next) => {
  try {
    const id = req.params.id;
    const bookings = await bookingModel.findById(id)

    if (!bookings) {
      return res.status(404).json({
        success: false,
        message: 'booking not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Booking fetched successfully',
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};
export const deleteBookingById = async (req, res, next) => {
  try {
    const id = req.params.id;
    const bookings = await bookingModel.findById(id)

    if (!bookings) {
      return res.status(404).json({
        success: false,
        message: 'booking not found',
      });
    }
    const deleteBooking = await bookingModel.findByIdAndDelete(id)
    return res.status(200).json({
      success: true,
      message: 'Booking deleted successfully',
      data: deleteBooking,
    });
  } catch (error) {
    next(error);
  }
};
export const logout = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - no user ID found in token',
      });
    }

    // Update user's lastLogout and optionally clear token
    await usersModel.findByIdAndUpdate(userId, {
      lastLogout: new Date(),
      authToken: null, // Optional: store and clear JWT
    });

    return res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
};
export const city = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    const token = await getAccessToken();
    console.log(token, "token>>>>");

    const response = await axios.get(
      "https://test.api.amadeus.com/v1/reference-data/locations",
      {
        params: {
          keyword,
          subType: "CITY,AIRPORT",
        },
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'city suggestions',
      data: response.data, // ✅ only send the actual data
    });

  } catch (error) {
    next(error);
  }
};
