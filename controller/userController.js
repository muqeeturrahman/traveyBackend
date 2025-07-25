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
import dealsModel from "../models/dealsModel.js";
import { sendEmail } from "../utilities/helpers.js"
import contactModel from "../models/conatctForm.js"
import { client, checkoutNodeJssdk } from '../paypalClient.js';

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
        console.log(currencyCode, ">>>>>>.")

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

export const bookFlight = async (req, res) => {
    try {
      const {
        from, to, price, date, time, duration, stops, travelClass,
        checkedBags, cabinBags, paymentMethod, adults, infants, children,
        departureDate, returnDate, departureAirline, returnAirline,
        fullName, email, phoneNumber, countryCode, dateOfBirth, gender,
        nationality, passportNumber, seatPreference, mealPreference,
        extraBaggageAddOns, currencyCode
      } = req.body;
  
      const flightDate = new Date(date);
      const flightTime = new Date(time);
      const orderId = `ORDER-${uuidv4()}`;
  
      // Save booking to DB
      const bookingData = {
        from, to, price, date: flightDate, time: flightTime,
        duration, stops, travelClass, checkedBags, cabinBags,
        paymentStatus: "pending", departureDate, departureAirline,
        fullName, email, phoneNumber, countryCode, currencyCode,
        paymentMethod, adults, infants, children, returnDate,
        returnAirline, dateOfBirth, gender, nationality, passportNumber,
        seatPreference, mealPreference, extraBaggageAddOns
      };
  
      const booking = await bookingModel.create(bookingData);
  
      // Handle payment based on method
      let paymentUrl = "";
      let paymentId = "";
  
      if (paymentMethod === "nowpayments") {
        const nowRes = await axios.post(
          "https://api.nowpayments.io/v1/invoice",
          {
            price_amount: price,
            price_currency: currencyCode,
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
  
        paymentUrl = nowRes.data.invoice_url;
        paymentId = nowRes.data.payment_id;
  
      } else if (paymentMethod === "paypal") {
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer('return=representation');
        request.requestBody({
          intent: 'CAPTURE',
          purchase_units: [{ amount: { currency_code: currencyCode, value: price.toString() } }],
          application_context: {
            brand_name: 'FlightOnBudget',
            landing_page: 'BILLING',
            user_action: 'PAY_NOW',
            return_url: "https://www.flightonbudget.com/checkout-success",
            cancel_url: "https://www.flightonbudget.com/checkout-cancel"
          }
        });
  
        const order = await client().execute(request);
        const approvalUrl = order.result.links.find(link => link.rel === "approve")?.href;
  
        if (!approvalUrl) {
          return res.status(500).json({ message: "PayPal approval URL not found" });
        }
  
        paymentUrl = approvalUrl;
        paymentId = order.result.id;
      }
  
      // Update booking with payment info
      booking.paymentId = paymentId;
      booking.orderId = orderId;
      await booking.save();
  
      res.status(201).json({
        success: true,
        message: "Flight booked, awaiting payment",
        data: {
          booking,
          payment_url: paymentUrl
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
        console.log(req.body, "body>>>>>>>>.");

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


export const flightOffers3 = async (req, res, next) => {
    try {
        // ✅ Get valid token (will refresh if needed)
        // const token = await getAccessToken();
        // console.log("✅ Token used:", token);

        // const { originLocationCode, destinationLocationCode, departureDate, adults, max } = req.body;
        // console.log(originLocationCode, ">>>>>>");

        // const response = await axios.get(
        //   "https://test.api.amadeus.com/v2/shopping/flight-offers",
        //   {
        //     params: {
        //       originLocationCode,
        //       destinationLocationCode,
        //       departureDate,
        //       adults: adults || 1,
        //       currencyCode: "USD",
        //       max,
        //     },
        //     headers: {
        //       Authorization: `Bearer ${token}`,
        //       "Content-Type": "application/json",
        //     },
        //   }
        // );
        let data = {
            "data": {
                "meta": {
                    "count": 5,
                    "links": {
                        "self": "https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=SYD&destinationLocationCode=NYC&departureDate=2025-05-25&adults=3&currencyCode=USD&max=5"
                    }
                },
                "data": [
                    {
                        "type": "flight-offer",
                        "id": "1",
                        "source": "GDS",
                        "instantTicketingRequired": false,
                        "nonHomogeneous": false,
                        "oneWay": false,
                        "isUpsellOffer": false,
                        "lastTicketingDate": "2025-05-25",
                        "lastTicketingDateTime": "2025-05-25",
                        "numberOfBookableSeats": 9,
                        "itineraries": [
                            {
                                "duration": "PT27H30M",
                                "segments": [
                                    {
                                        "departure": {
                                            "iataCode": "SYD",
                                            "terminal": "1",
                                            "at": "2025-05-25T09:30:00"
                                        },
                                        "arrival": {
                                            "iataCode": "ICN",
                                            "terminal": "1",
                                            "at": "2025-05-25T19:00:00"
                                        },
                                        "carrierCode": "OZ",
                                        "number": "602",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "OZ"
                                        },
                                        "duration": "PT10H30M",
                                        "id": "5",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    },
                                    {
                                        "departure": {
                                            "iataCode": "ICN",
                                            "terminal": "1",
                                            "at": "2025-05-25T21:05:00"
                                        },
                                        "arrival": {
                                            "iataCode": "JFK",
                                            "terminal": "1",
                                            "at": "2025-05-25T23:00:00"
                                        },
                                        "carrierCode": "OZ",
                                        "number": "224",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "OZ"
                                        },
                                        "duration": "PT14H55M",
                                        "id": "6",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    }
                                ]
                            }
                        ],
                        "price": {
                            "currency": "USD",
                            "total": "2570.43",
                            "base": "1821.00",
                            "fees": [
                                {
                                    "amount": "0.00",
                                    "type": "SUPPLIER"
                                },
                                {
                                    "amount": "0.00",
                                    "type": "TICKETING"
                                }
                            ],
                            "grandTotal": "2570.43"
                        },
                        "pricingOptions": {
                            "fareType": [
                                "PUBLISHED"
                            ],
                            "includedCheckedBagsOnly": true
                        },
                        "validatingAirlineCodes": [
                            "OZ"
                        ],
                        "travelerPricings": [
                            {
                                "travelerId": "1",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "856.81",
                                    "base": "607.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "5",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "KLOOU",
                                        "class": "K",
                                        "includedCheckedBags": {
                                            "quantity": 2
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        }
                                    },
                                    {
                                        "segmentId": "6",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "KLOOU",
                                        "class": "K",
                                        "includedCheckedBags": {
                                            "quantity": 2
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        }
                                    }
                                ]
                            },
                            {
                                "travelerId": "2",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "856.81",
                                    "base": "607.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "5",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "KLOOU",
                                        "class": "K",
                                        "includedCheckedBags": {
                                            "quantity": 2
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        }
                                    },
                                    {
                                        "segmentId": "6",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "KLOOU",
                                        "class": "K",
                                        "includedCheckedBags": {
                                            "quantity": 2
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        }
                                    }
                                ]
                            },
                            {
                                "travelerId": "3",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "856.81",
                                    "base": "607.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "5",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "KLOOU",
                                        "class": "K",
                                        "includedCheckedBags": {
                                            "quantity": 2
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        }
                                    },
                                    {
                                        "segmentId": "6",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "KLOOU",
                                        "class": "K",
                                        "includedCheckedBags": {
                                            "quantity": 2
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "flight-offer",
                        "id": "2",
                        "source": "GDS",
                        "instantTicketingRequired": false,
                        "nonHomogeneous": false,
                        "oneWay": false,
                        "isUpsellOffer": false,
                        "lastTicketingDate": "2025-05-25",
                        "lastTicketingDateTime": "2025-05-25",
                        "numberOfBookableSeats": 9,
                        "itineraries": [
                            {
                                "duration": "PT27H",
                                "segments": [
                                    {
                                        "departure": {
                                            "iataCode": "SYD",
                                            "terminal": "1",
                                            "at": "2025-05-25T07:35:00"
                                        },
                                        "arrival": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-25T15:05:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "110",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT9H30M",
                                        "id": "1",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    },
                                    {
                                        "departure": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-25T16:15:00"
                                        },
                                        "arrival": {
                                            "iataCode": "JFK",
                                            "terminal": "8",
                                            "at": "2025-05-25T20:35:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "840",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT16H20M",
                                        "id": "2",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    }
                                ]
                            }
                        ],
                        "price": {
                            "currency": "USD",
                            "total": "2590.53",
                            "base": "1611.00",
                            "fees": [
                                {
                                    "amount": "0.00",
                                    "type": "SUPPLIER"
                                },
                                {
                                    "amount": "0.00",
                                    "type": "TICKETING"
                                }
                            ],
                            "grandTotal": "2590.53"
                        },
                        "pricingOptions": {
                            "fareType": [
                                "PUBLISHED"
                            ],
                            "includedCheckedBagsOnly": true
                        },
                        "validatingAirlineCodes": [
                            "CX"
                        ],
                        "travelerPricings": [
                            {
                                "travelerId": "1",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "1",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "2",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "2",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "1",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "2",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "3",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "1",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "2",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "flight-offer",
                        "id": "3",
                        "source": "GDS",
                        "instantTicketingRequired": false,
                        "nonHomogeneous": false,
                        "oneWay": false,
                        "isUpsellOffer": false,
                        "lastTicketingDate": "2025-05-25",
                        "lastTicketingDateTime": "2025-05-25",
                        "numberOfBookableSeats": 9,
                        "itineraries": [
                            {
                                "duration": "PT29H55M",
                                "segments": [
                                    {
                                        "departure": {
                                            "iataCode": "SYD",
                                            "terminal": "1",
                                            "at": "2025-05-25T14:05:00"
                                        },
                                        "arrival": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-25T21:30:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "100",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT9H25M",
                                        "id": "7",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    },
                                    {
                                        "departure": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-26T02:00:00"
                                        },
                                        "arrival": {
                                            "iataCode": "JFK",
                                            "terminal": "8",
                                            "at": "2025-05-26T06:00:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "844",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT16H",
                                        "id": "8",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    }
                                ]
                            }
                        ],
                        "price": {
                            "currency": "USD",
                            "total": "2590.53",
                            "base": "1611.00",
                            "fees": [
                                {
                                    "amount": "0.00",
                                    "type": "SUPPLIER"
                                },
                                {
                                    "amount": "0.00",
                                    "type": "TICKETING"
                                }
                            ],
                            "grandTotal": "2590.53"
                        },
                        "pricingOptions": {
                            "fareType": [
                                "PUBLISHED"
                            ],
                            "includedCheckedBagsOnly": true
                        },
                        "validatingAirlineCodes": [
                            "CX"
                        ],
                        "travelerPricings": [
                            {
                                "travelerId": "1",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "7",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "8",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "2",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "7",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "8",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "3",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "7",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "8",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "flight-offer",
                        "id": "4",
                        "source": "GDS",
                        "instantTicketingRequired": false,
                        "nonHomogeneous": false,
                        "oneWay": false,
                        "isUpsellOffer": false,
                        "lastTicketingDate": "2025-05-25",
                        "lastTicketingDateTime": "2025-05-25",
                        "numberOfBookableSeats": 9,
                        "itineraries": [
                            {
                                "duration": "PT33H55M",
                                "segments": [
                                    {
                                        "departure": {
                                            "iataCode": "SYD",
                                            "terminal": "1",
                                            "at": "2025-05-25T10:05:00"
                                        },
                                        "arrival": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-25T17:35:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "162",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT9H30M",
                                        "id": "9",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    },
                                    {
                                        "departure": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-26T02:00:00"
                                        },
                                        "arrival": {
                                            "iataCode": "JFK",
                                            "terminal": "8",
                                            "at": "2025-05-26T06:00:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "844",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT16H",
                                        "id": "10",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    }
                                ]
                            }
                        ],
                        "price": {
                            "currency": "USD",
                            "total": "2590.53",
                            "base": "1611.00",
                            "fees": [
                                {
                                    "amount": "0.00",
                                    "type": "SUPPLIER"
                                },
                                {
                                    "amount": "0.00",
                                    "type": "TICKETING"
                                }
                            ],
                            "grandTotal": "2590.53"
                        },
                        "pricingOptions": {
                            "fareType": [
                                "PUBLISHED"
                            ],
                            "includedCheckedBagsOnly": true
                        },
                        "validatingAirlineCodes": [
                            "CX"
                        ],
                        "travelerPricings": [
                            {
                                "travelerId": "1",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "9",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "10",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "2",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "9",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "10",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "3",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "863.51",
                                    "base": "537.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "9",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "10",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "flight-offer",
                        "id": "5",
                        "source": "GDS",
                        "instantTicketingRequired": false,
                        "nonHomogeneous": false,
                        "oneWay": false,
                        "isUpsellOffer": false,
                        "lastTicketingDate": "2025-05-25",
                        "lastTicketingDateTime": "2025-05-25",
                        "numberOfBookableSeats": 9,
                        "itineraries": [
                            {
                                "duration": "PT29H25M",
                                "segments": [
                                    {
                                        "departure": {
                                            "iataCode": "SYD",
                                            "terminal": "1",
                                            "at": "2025-05-25T21:50:00"
                                        },
                                        "arrival": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-26T05:10:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "138",
                                        "aircraft": {
                                            "code": "359"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT9H20M",
                                        "id": "3",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    },
                                    {
                                        "departure": {
                                            "iataCode": "HKG",
                                            "terminal": "1",
                                            "at": "2025-05-26T09:05:00"
                                        },
                                        "arrival": {
                                            "iataCode": "JFK",
                                            "terminal": "8",
                                            "at": "2025-05-26T13:15:00"
                                        },
                                        "carrierCode": "CX",
                                        "number": "830",
                                        "aircraft": {
                                            "code": "77W"
                                        },
                                        "operating": {
                                            "carrierCode": "CX"
                                        },
                                        "duration": "PT16H10M",
                                        "id": "4",
                                        "numberOfStops": 0,
                                        "blacklistedInEU": false
                                    }
                                ]
                            }
                        ],
                        "price": {
                            "currency": "USD",
                            "total": "2668.53",
                            "base": "1689.00",
                            "fees": [
                                {
                                    "amount": "0.00",
                                    "type": "SUPPLIER"
                                },
                                {
                                    "amount": "0.00",
                                    "type": "TICKETING"
                                }
                            ],
                            "grandTotal": "2668.53"
                        },
                        "pricingOptions": {
                            "fareType": [
                                "PUBLISHED"
                            ],
                            "includedCheckedBagsOnly": true
                        },
                        "validatingAirlineCodes": [
                            "CX"
                        ],
                        "travelerPricings": [
                            {
                                "travelerId": "1",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "889.51",
                                    "base": "563.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "3",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "4",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "2",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "889.51",
                                    "base": "563.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "3",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "4",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                "travelerId": "3",
                                "fareOption": "STANDARD",
                                "travelerType": "ADULT",
                                "price": {
                                    "currency": "USD",
                                    "total": "889.51",
                                    "base": "563.00"
                                },
                                "fareDetailsBySegment": [
                                    {
                                        "segmentId": "3",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        "segmentId": "4",
                                        "cabin": "ECONOMY",
                                        "fareBasis": "NR21AUKO",
                                        "brandedFare": "ECONLIGHT",
                                        "brandedFareLabel": "ECONOMY LIGHT",
                                        "class": "N",
                                        "includedCheckedBags": {
                                            "quantity": 1
                                        },
                                        "includedCabinBags": {
                                            "quantity": 1
                                        },
                                        "amenities": [
                                            {
                                                "description": "1PC MAX 23KG 158LCM EACH",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "1PC MAX 15LB 7KG 115LCM",
                                                "isChargeable": false,
                                                "amenityType": "BAGGAGE",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "SEAT ASSIGNMENT",
                                                "isChargeable": true,
                                                "amenityType": "PRE_RESERVED_SEAT",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "REFUNDABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "MILEAGE ACCRUAL",
                                                "isChargeable": false,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            },
                                            {
                                                "description": "CHANGEABLE TICKET",
                                                "isChargeable": true,
                                                "amenityType": "BRANDED_FARES",
                                                "amenityProvider": {
                                                    "name": "BrandedFare"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ],
                "dictionaries": {
                    "locations": {
                        "ICN": {
                            "cityCode": "SEL",
                            "countryCode": "KR"
                        },
                        "HKG": {
                            "cityCode": "HKG",
                            "countryCode": "HK"
                        },
                        "JFK": {
                            "cityCode": "NYC",
                            "countryCode": "US"
                        },
                        "SYD": {
                            "cityCode": "SYD",
                            "countryCode": "AU"
                        }
                    },
                    "aircraft": {
                        "359": "AIRBUS A350-900",
                        "77W": "BOEING 777-300ER"
                    },
                    "currencies": {
                        "USD": "US DOLLAR"
                    },
                    "carriers": {
                        "CX": "CATHAY PACIFIC",
                        "OZ": "ASIANA AIRLINES"
                    }
                }
            },
            "success": true,
            "message": "Flight offers fetched successfully"
        }

        return res.status(200).json({
            // data: response.data,
            ...data,
            success: true,
            message: "Flight offers fetched successfully",
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

export const register = async (req, res, next) => {
    try {
        const { email, password, confirmPassword, role } = req.body;

        if (!email || !password || !confirmPassword || !role) {
            return res.status(400).json({
                success: false,
                message: "All fields are required.",
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match.",
            });
        }

        const userExists = await usersModel.findOne({ email, isDeleted: false });
        if (userExists) {
            return res.status(400).json({
                success: false,
                message: "User already exists.",
            });
        }

        const hashedPassword = await hash(password, 10);

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000);
        const otpGenerateTimeDate = new Date();

        // Send OTP email
        await sendEmail(email, "OTP Code", `Your OTP code is ${otpCode}`);

        // Create user with OTP
        const user = await usersModel.create({
            email,
            role,
            password: hashedPassword,
            otpCode,
            otpGenerateTimeDate,
            isOtpExpire: false,
            isOtpVerified: false,
        });

        return res.status(201).json({
            success: true,
            message: "User registered successfully. OTP sent to email.",
            data: user
        });
    } catch (error) {
        console.error("Registration error:", error);
        next(error);
    }
};
export const verifyOtp = async (req, res, next) => {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP code are required.",
            });
        }

        const user = await usersModel.findOne({ email, isDeleted: false });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (user.isOtpVerified) {
            return res.status(400).json({
                success: false,
                message: "OTP already verified.",
            });
        }

        // Check if OTP is expired (e.g., 10 minutes validity)
        const now = new Date();
        const expiryTime = new Date(user.otpGenerateTimeDate);
        expiryTime.setMinutes(expiryTime.getMinutes() + 10);

        if (now > expiryTime) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one.",
            });
        }

        if (user.otpCode !== Number(otpCode)) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP code.",
            });
        }

        // Update user OTP verification status
        user.isOtpVerified = true;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully.",
        });
    } catch (error) {
        console.error("OTP verification error:", error);
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

        // Check if OTP is verified
        if (!user.isOtpVerified) {
            return res.status(403).json({
                success: false,
                message: 'OTP not verified. Please verify your email before logging in.',
            });
        }

        // Generate JWT Token
        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: { user, token },
        });
    } catch (error) {
        next(error);
    }
};
export const forgetPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        const user = await usersModel.findOne({ email, isDeleted: false });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Generate OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000);
        const otpGenerateTimeDate = new Date();

        // Save OTP info
        user.otpCode = otpCode;
        user.otpGenerateTimeDate = otpGenerateTimeDate;
        user.isForgetPasswordVerifiied = false;
        await user.save();

        // Send email
        await sendEmail(email, "Password Reset OTP", `Your OTP code is ${otpCode}`);

        return res.status(200).json({
            success: true,
            message: "OTP sent to email for password reset.",
        });
    } catch (error) {
        console.error("Forget password error:", error);
        next(error);
    }
};
export const verifyForgetPassword = async (req, res, next) => {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({ success: false, message: "Email and OTP are required." });
        }

        const user = await usersModel.findOne({ email, isDeleted: false });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Check if OTP is expired (e.g. 10 min)
        const now = new Date();
        const expiryTime = new Date(user.otpGenerateTimeDate);
        expiryTime.setMinutes(expiryTime.getMinutes() + 10);

        if (now > expiryTime) {
            return res.status(400).json({ success: false, message: "OTP has expired." });
        }

        if (user.otpCode !== Number(otpCode)) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }

        user.isForgetPasswordVerifiied = true;
        await user.save();

        return res.status(200).json({ success: true, message: "OTP verified. You can now reset your password." });
    } catch (error) {
        console.error("Verify forget password error:", error);
        next(error);
    }
};
export const resetPassword = async (req, res, next) => {
    try {
        const { email, newPassword, confirmNewPassword } = req.body;

        if (!email || !newPassword || !confirmNewPassword) {
            return res.status(400).json({
                success: false,
                message: "Email, new password and confirmation are required.",
            });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match.",
            });
        }

        const user = await usersModel.findOne({ email, isDeleted: false });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (!user.isForgetPasswordVerifiied) {
            return res.status(403).json({
                success: false,
                message: "OTP not verified for password reset.",
            });
        }

        // Hash new password and update
        const hashedPassword = await hash(newPassword, 10);
        user.password = hashedPassword;

        // Reset OTP flags after successful password reset
        user.isForgetPasswordVerifiied = false;
        user.otpCode = null;
        user.otpGenerateTimeDate = null;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successfully.",
        });
    } catch (error) {
        console.error("Reset password error:", error);
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

export const createDeal = async (req, res, next) => {
    try {
        const {
            title,
            aboutThisTour,
            highlights,
            included,
            excluded,
            picture
        } = req.body;

        const newDeal = new dealsModel({
            title,
            aboutThisTour,
            highlights,
            included,
            excluded,
            picture
        });

        const savedDeal = await newDeal.save();

        res.status(201).json({
            success: true,
            message: "Deal created successfully",
            data: savedDeal
        });
    } catch (error) {
        console.error("deal error:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: "Deal creation failed",
            error: error.response?.data || error.message
        });
    }
};
export const getDeals = async (req, res, next) => {
    try {
        const deals = await dealsModel.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            message: "All deals fetched successfully",
            data: deals
        });
    } catch (error) {
        console.error("getDeals error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch deals",
            error: error.message
        });
    }
};
export const getDealById = async (req, res, next) => {
    try {
        const id = req.params.id;
        const deal = await dealsModel.findById(id);

        if (!deal) {
            return res.status(404).json({
                success: false,
                message: "Deal not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Deal fetched successfully",
            data: deal
        });
    } catch (error) {
        console.error("getDealById error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch deal",
            error: error.message
        });
    }
};
export const contactAdmin = async (req, res, next) => {
    try {
        const { name, email, message } = req.body

        const contact = await contactModel.create({
            name,
            email,
            message
        });

        res.status(200).json({
            success: true,
            message: "message sent to admin successfully",
            data: contact
        });
    } catch (error) {
        console.error("error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to Send Message",
            error: error.message
        });
    }
};




