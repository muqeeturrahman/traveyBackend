import express from "express"
import axios from "axios"
import dotenv from "dotenv"
import { client, checkoutNodeJssdk } from '../paypalClient.js';
console.log("api hitting");

export const createOrder = async (req, res) => {
  const { value , currency_code } = req.body;

  const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: { currency_code, value }
      }
    ],
    application_context: {
      brand_name: 'Test Store',
      landing_page: 'BILLING', // Show debit/credit card form first
      user_action: 'PAY_NOW',
      return_url: 'https://www.flightonbudget.com/checkout-success',
      cancel_url: 'https://www.flightonbudget.com/checkout-cancel'
    }
  });

  try {
    const order = await client().execute(request);
    const approvalUrl = order.result.links.find(link => link.rel === "approve")?.href;

    if (!approvalUrl) {
      return res.status(500).json({ message: 'Approval URL not found' });
    }

    res.json({ orderID: order.result.id, approvalUrl });
  } catch (err) {
    console.error('PayPal Create Order Error:', err);
    res.status(500).send('Something went wrong');
  }
};



export const captureOrder = async (req, res) => {
  const { orderID } = req.body;
  const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
    const capture = await client().execute(request);
    const updateBooking=await bookingModel.findOneAndUpdate({paymentId:orderID},{paymentStatus:"confirmed"})
    res.json({ status: capture.result.status });
  } catch (err) {
    console.error(err);
    res.status(500).send('Capture failed');
  }
};