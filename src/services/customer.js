const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const jwt = require("jsonwebtoken");
const axios = require("axios");
const bcrypt = require('bcrypt');

const specificTimeZone = 'Asia/Ho_Chi_Minh';
const formatType = "YYYY-MM-DD-HH:mm:ss";

const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const phoneNumberRegex = /^(?:\+84|0)[1-9]\d{8}$/;


const FirebaseService = require('./firebase');
const OTPService = require('./otp');

const { AuthTokenModel, CustomerModel, MessageResponseModel } = require('../models');
const MessageResponses = require('../models/model.message.response');

const { formatPhoneNumber } = require('../helpers/index');

class CustomerService {

    register = async (req, res) => {
        let email = req.body.email;
        let password = req.body.password;
        let fullName = req.body.full_name;
        let phoneNumber = req.body.phone_number;
        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        const URL = process.env.URL;
        let ipAddressLocal = process.env.IP_LOCAL;
        let portLocal = process.env.PORT;


        if (email === undefined || email.toString().trim().length == 0) {
            return res.send({ message: "missing emai", statusCode: 400, code: "auth/missing-email", timestamp });
        }
        if (password === undefined || password.toString().trim().length == 0) {
            return res.send({ message: "missing password", statusCode: 400, code: "auth/missing-password", timestamp });
        }
        if (fullName === undefined || fullName.toString().trim().length == 0) {
            return res.send({ message: "missing full-name", statusCode: 400, code: "auth/missing-fullname", timestamp });
        }
        if (phoneNumber === undefined || phoneNumber.toString().trim().length == 0) {
            return res.send({ message: "missing phone-number", statusCode: 400, code: "auth/missing-phonenumber", timestamp });
        }

        if (!phoneNumberRegex.test(phoneNumber)) {
            return res.send({
                message: "The phone number is not in the correct format",
                statusCode: 400,
                code: "auth/non-valid-phonenumber",
                timestamp
            });
        }

        if (!passwordRegex.test(password)) {
            return res.send({
                message:
                    "Minimum password 8 characters, at least 1 capital letter, 1 number and 1 special character",
                statusCode: 400,
                code: "auth/non-valid-password",
                timestamp
            });
        }

        try {
            // TODO check exists
            let cusByPhone = await CustomerModel.customerModel.findOne({ phone_number: phoneNumber, }).lean();
            let cusByEmail = await CustomerModel.customerModel.findOne({ email: email }).lean();
            if (cusByPhone) {
                return res.send({
                    message: "This phone number is registered to another account",
                    statusCode: 400,
                    code: "auth/phone-exists",
                    timestamp
                });
            }
            if (cusByEmail) {
                if (cusByEmail.status === "Not verified") {
                    // const link = `http://${ipAddressLocal}:${portLocal}/v1/api/customer/verify?type=${"register"}&key=${cusByEmail._id.toString()}`;
                    const link = `${URL}/v1/api/customer/verify?type=${"register"}&key=${cusByEmail._id.toString()}`;
                    const text = `STECH xin chào bạn\nẤn vào đây để xác thực tài khoản: ${link}`;
                    let index = OTPService.sendEmailVerifyCus(email, text);
                    if (index === 0) {
                        return res.send({
                            message: "send verify account fail",
                            statusCode: 400,
                            code: "auth/unsend-mail",
                            timestamp
                        });
                    }
                    return res.send({
                        message: "Account has been registered\nPlease verify your account in email!",
                        statusCode: 400,
                        code: "auth/account-exists",
                        timestamp
                    })
                }
                return res.send({
                    message: "This email is registered to another account",
                    statusCode: 400,
                    code: "auth/email-exists",
                    timestamp
                });
            }
            // if (cusByPhone) {
            //     const link = `http://${ipAddressLocal}:${portLocal}/v1/api/customer/verify?type=${"register"}&key=${cusByPhone._id.toString()}`;
            //     const text = `STECH xin chào bạn\nẤn vào đây để xác thực tài khoản: ${link}`;
            //     let index = sendEmailVerifyCus(email, text);
            //     if (index === 0) {
            //         return res.send({
            //             message: "send verify account fail",
            //             statusCode: 400,
            //             code: "auth/unsend-mail"
            //         });
            //     }
            //     if (cusByPhone.status === "Not verified") {
            //         return res.send({
            //             message: "Account has been registered\nPlease verify your account in email!",
            //             statusCode: 400,
            //             code: "auth/account-exists"
            //         })
            //     }
            //     return res.send({
            //         message: "phone number already exists",
            //         statusCode: 400,
            //         code: "auth/phone-exists"
            //     });
            // }
            // TODO create customer
            const passwordHash = await bcrypt.hash(password, 10);
            let cus = new CustomerModel.customerModel({
                email: email,
                password: passwordHash,
                full_name: fullName,
                phone_number: phoneNumber,
                created_at: timestamp,
            });
            // TODO send mail verify
            // const link = `http://${ipAddressLocal}:${portLocal}/v1/api/customer/verify?type=${"register"}&key=${cus._id.toString()}`;
            const link = `${URL}/v1/api/customer/verify?type=${"register"}&key=${cus._id.toString()}`;
            const text = `STECH xin chào bạn\nẤn vào đây để xác thực tài khoản: ${link}`;
            let index = OTPService.sendEmailVerifyCus(email, text);
            if (index === 0) {
                return res.send({
                    message: "send verify account fail",
                    statusCode: 400,
                    code: "auth/unsend-mail",
                    timestamp
                });
            } else {
                await cus.save();
            }
            cus.password = password;
            return res.send({
                customer: cus,
                message: "Register success!\nPlease verify your account in email.",
                statusCode: 200,
                code: "auth/verify",
                timestamp
            });
        } catch (e) {
            console.log(e.message);
            return res.send({
                message: e.message.toString(),
                statusCode: 400,
                code: `auth/${e.code}`,
                timestamp
            });
        }
    }
    // TODO verify
    verify = async (req, res) => {
        let key = req.query.key;
        let type = req.query.type;
        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        try {
            let cus = await CustomerModel.customerModel.findById(key);
            if (cus) {
                if (cus.status === "Not verified") {
                    cus.status = "Has been activated";
                    await cus.save();
                    await CustomerModel.customerModel.deleteMany({ phone_number: cus.phone_number, status: "Not verified" });
                }
            } else {
                return res.send({
                    message: "Activation failed",
                    statusCode: 400,
                    code: "auth/active-fail",
                    timestamp
                });
            }
            return res.send({
                message: "Has been activated",
                statusCode: 200,
                code: "auth/activated",
                timestamp
            });
        } catch (e) {
            console.log(e.message);
            return res.send({
                message: e.message.toString(),
                statusCode: 400,
                code: `auth/${e.code}`,
                timestamp
            });
        }
    }

    login = async (req, res) => {
        let email = req.body.email;
        let phoneNumer = req.body.phone_number;
        let password = req.body.password;
        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        if (email === undefined || email.toString().trim().length == 0) {
            return res.send({ message: "email require", statusCode: 400, code: "auth/missing-email", timestamp });
        }
        if (password === undefined || password.toString().trim().length == 0) {
            return res.send({ message: "password require", statusCode: 400, code: "auth/missing-password", timestamp });
        }


        try {
            let cusEmail = await CustomerModel.customerModel.findOne({ email: email });
            let cusPhone = await CustomerModel.customerModel.findOne({ phone_number: phoneNumer });
            if (!cusEmail && !cusPhone) {
                return res.send({
                    message: "Login failed: Account does not exist",
                    statusCode: 400,
                    code: "auth/account-notexist",
                    timestamp
                });
            }


            if (cusPhone) {
                const match = await bcrypt.compare(password, cusPhone.password);
                if (!match) {
                    return res.send({
                        message: "Incorrect password.",
                        statusCode: 400,
                        code: "auth/incorrect-password",
                        timestamp
                    });
                }
                if (cusPhone.status !== "Has been activated") {
                    return res.send({
                        message: "Your account has not been activated or has been locked, please contact hotline 0999999999 for help.",
                        statusCode: 400,
                        code: "auth/no-verify",
                        timestamp
                    });
                }
                const otp = Math.floor(100000 + Math.random() * 900000);
                const apiKey = process.env.API_KEY_INFOBIP;
                const baseUrl = process.env.BASE_URL_INFOBIP;
                const text = `STECH xin chào bạn\nMã OTP của bạn là: ${otp}\nVui lòng không cung cấp mã OTP cho bất kì ai`;
                const to = formatPhoneNumber(cusPhone.phone_number);
                console.log(to)
                const headers = {
                    Authorization: `App ${apiKey}`,
                    "Content-Type": "application/json",
                };

                const payload = {
                    messages: [
                        {
                            destinations: [{ to }],
                            text,
                        },
                    ],
                };

                // Gửi tin nhắn OTP bằng InfoBip REST API
                axios
                    .post(baseUrl, payload, { headers })
                    .then(async (response) => {
                        console.log('Axios Response:', response.data);
                        cusPhone.otp = otp;
                        await cusPhone.save();
                        return res.send({
                            message: "Please verify your account",
                            id: cusPhone._id,
                            customer: cusPhone,
                            statusCode: 200,
                            code: "auth/verify-phone",
                            timestamp
                        });
                    })
                    .catch((error) => {
                        console.error(error.message);
                        return res.send({
                            message: "Fail send code",
                            statusCode: 400,
                            code: `auth/${error.code}`,
                            timestamp
                        });
                    });
            }

            if (cusEmail) {
                const match = await bcrypt.compare(password, cusEmail.password);
                if (!match) {
                    return res.send({
                        message: "Incorrect password.",
                        statusCode: 400,
                        code: "auth/incorrect-password",
                        timestamp
                    });
                }
                if (cusEmail.status !== "Has been activated") {
                    return res.send({
                        message: "Your account has not been activated or has been locked, please contact Email: datnstech@gmail.com for help.",
                        statusCode: 400,
                        code: "auth/no-verify",
                        timestamp
                    });
                }
                let otp = await OTPService.sendOTPByEmail(cusEmail.email);
                if (otp === 0) {
                    return res.send({
                        message: "Verify customer failed",
                        statusCode: 400,
                        code: "auth/verify-failed",
                        timestamp
                    });
                } else {
                    cusEmail.otp = otp;
                    await cusEmail.save();
                    cusEmail.password = password;
                    let messageResponse = new MessageResponses();
                    const id = uuidv4();
                    messageResponse.setId(id);
                    messageResponse.setStatusCode(200);
                    messageResponse.setContent("Please verify your account");
                    messageResponse.setCreatedAt(timestamp);
                    return res.send({
                        message: messageResponse.toJSON(),
                        id: cusEmail._id,
                        customer: cusEmail,
                        statusCode: 200,
                        code: "auth/verify",
                        timestamp
                    });
                }
            }
        } catch (e) {
            console.log(e.message);
            return res.send({
                message: e.message.toString(),
                statusCode: 400,
                code: `auth/${e.code}`,
                timestamp
            });
        }
    }

    checkLogin = async (req, res) => {
        let email = req.body.email;
        let phoneNumer = req.body.phone_number;
        let password = req.body.password;
        const token = req.header('Authorization');
        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        let messageResponseRequire = new MessageResponses();
        const id = uuidv4();
        messageResponseRequire.setId(id);
        messageResponseRequire.setStatusCode(400);
        messageResponseRequire.setCreatedAt(timestamp);

        if (email === undefined || email.toString().trim().length == 0) {
            messageResponseRequire.setCode("auth/missing-email");
            messageResponseRequire.setContent("email require");
            return res.send({ message: messageResponseRequire.toJSON(), statusCode: 400, code: "auth/missing-email", timestamp });
        }
        if (password === undefined || password.toString().trim().length == 0) {
            messageResponseRequire.setCode("auth/missing-password");
            messageResponseRequire.setContent("password require");
            return res.send({ message: messageResponseRequire.toJSON(), statusCode: 400, code: "auth/missing-password", timestamp });
        }
        if (token === undefined || token.toString().trim().length == 0) {
            messageResponseRequire.setCode("auth/missing-token");
            messageResponseRequire.setContent("token require");
            return res.send({ message: messageResponseRequire.toJSON(), statusCode: 400, code: "auth/missing-token", timestamp });
        }

        try {
            let cusEmail = await CustomerModel.customerModel.findOne({ email: email });
            if (cusEmail) {
                const match = await bcrypt.compare(password, cusEmail.password);
                if (match) {
                    let authToken = await AuthTokenModel.authTokenModel.findOne({ customer_id: cusEmail._id });
                    if (authToken && authToken.token === token) {
                        let messageResponse = new MessageResponses();
                        const id = uuidv4();
                        messageResponse.setId(id);
                        messageResponse.setStatusCode(200);
                        messageResponse.setCreatedAt(timestamp);
                        return res.send({
                            message: messageResponse.toJSON(),
                            statusCode: 200,
                            code: `auth/200`,
                            timestamp
                        });
                    }
                    messageResponseRequire.setCode(`auth/wrong-token`);
                    messageResponseRequire.setContent("wrong token");
                    return res.send({
                        message: messageResponseRequire.toJSON(),
                        statusCode: 400,
                        code: `auth/wrong-token`,
                        timestamp
                    });
                }
                else {
                    messageResponseRequire.setCode(`auth/wrong-pass`);
                    messageResponseRequire.setContent("wrong password");
                    return res.send({
                        message: messageResponseRequire.toJSON(),
                        statusCode: 400,
                        code: `auth/wrong-pass`,
                        timestamp
                    });
                }
            }
            else {
                messageResponseRequire.setCode(`auth/account-notexists`);
                messageResponseRequire.setContent("Not exists");
                return res.send({
                    message: messageResponseRequire.toJSON(),
                    statusCode: 400,
                    code: `auth/account-notexists`,
                    timestamp
                });
            }
        } catch (e) {
            console.log("checkLogin: ", e.message);
            messageResponseRequire.setCode(`auth/${e.code}`);
            messageResponseRequire.setContent(e.message.toString());
            return res.send({
                message: messageResponseRequire.toJSON(),
                statusCode: 200,
                code: `auth/${e.code}`,
                timestamp
            });
        }
    }

    verifyLogin = async (req, res) => {
        const customerID = req.body._id;
        const password = req.body.password;
        const otp = req.body.otp;
        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        if (customerID === undefined || customerID.toString().trim().length == 0) {
            return res.send({ message: "customerID require", statusCode: 400, code: "auth/missing-customerid", timestamp });
        }
        if (password === undefined || password.toString().trim().length == 0) {
            return res.send({ message: "password require", statusCode: 400, code: "auth/missing-password", timestamp });
        }
        if (otp === undefined || otp.toString().trim().length == 0) {
            return res.send({ message: "otp require", statusCode: 400, code: "auth/missing-otp", timestamp });
        }
        try {
            let customer = await CustomerModel.customerModel.findOne({ _id: customerID, otp: otp })
            if (customer) {
                // ms('2 days')  // 172800000
                // ms('1d')      // 86400000
                // ms('10h')     // 36000000
                // ms('2.5 hrs') // 9000000
                // ms('2h')      // 7200000
                // ms('1m')      // 60000
                // ms('5s')      // 5000
                let token = jwt.sign({ customer: customer }, process.env.ACCESS_TOKEN_SECRET, {
                    expiresIn: "10h",
                });
                let currentAuthToken = await AuthTokenModel.authTokenModel.findOne({ customer_id: customer._id }).lean();
                if (currentAuthToken) {
                    const filterAuthToken = {
                        customer_id: customer._id
                    };
                    const updateAuthToken = { token: token, created_at: timestamp };
                    await AuthTokenModel.authTokenModel.findOneAndUpdate(filterAuthToken, updateAuthToken).lean();
                }
                else {
                    let authToken = new AuthTokenModel.authTokenModel({
                        customer_id: customer._id,
                        token,
                        created_at: timestamp,
                    });
                    await authToken.save();
                }
                customer.otp = null;
                await customer.save();
                customer.password = password;
                let messageResponse = new MessageResponses();
                const id = uuidv4();
                messageResponse.setId(id);
                messageResponse.setStatusCode(200);
                messageResponse.setContent("Login success");
                messageResponse.setCreatedAt(timestamp);
                return res.send({
                    customer: customer,
                    token: token,
                    message: messageResponse.toJSON(),
                    statusCode: 200,
                    code: `auth/login-success`,
                    timestamp
                });
            } else {
                return res.send({
                    message: "otp wrong",
                    statusCode: 200,
                    code: `auth/wrong-otp`,
                    timestamp
                });
            }
        } catch (e) {
            console.log(e.message);
            return res.send({
                message: e.message.toString(), statusCode: 400,
                code: `auth/${e.code}`,
                timestamp
            });
        }
    }

    addFCM = async (req, res) => {
        let customerID = req.body._id;
        let fcm = req.body.fcm;
        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        if (customerID === undefined || customerID.toString().trim().length == 0) {
            return res.send({ message: "Missing customerID", statusCode: 400, code: "auth/missing-customerid", timestamp });
        }
        if (fcm === undefined || fcm.toString().trim().length == 0) {
            return res.send({ message: "Missing fcm", statusCode: 400, code: "auth/missing-fcm", timestamp });
        }

        try {
            let cus = await CustomerModel.customerModel.findById(customerID);
            if (!cus) {
                return res.send({
                    message: "Customer not found",
                    statusCode: 400,
                    code: `auth/customer-notfound`,
                    timestamp
                });
            }
            cus.fcm = fcm;
            await cus.save();
            let messageResponse = new MessageResponses();
            const id = uuidv4();
            messageResponse.setId(id);
            messageResponse.setStatusCode(200);
            messageResponse.setContent("add fcm success");
            messageResponse.setCreatedAt(timestamp);
            return res.send({
                message: messageResponse.toJSON(),
                statusCode: 200,
                code: `auth/add-fcm-success`,
                timestamp
            });
        } catch (e) {
            console.log(`error add fcm: ${e.message}`);
            return res.send({
                message: e.message.toString(), statusCode: 400,
                code: `auth/${e.code}`,
                timestamp
            })
        }
    }
    logout = async (req, res) => {
        const customerID = req.body.customerID;
        const token = req.header('Authorization');

        let date = new Date();
        let timestamp = moment(date).tz(specificTimeZone).format(formatType);

        if (customerID === undefined || customerID.toString().trim().length == 0) {
            return res.send({ message: "Missing customerID", statusCode: 400, code: "auth/missing-customerid", timestamp });
        }
        if (token === undefined || token.toString().trim().length == 0) {
            return res.send({ message: "Missing token", statusCode: 400, code: "auth/missing-token", timestamp });
        }

        try {
            const filter = {
                customer_id: customerID,
                token: token
            };

            let authToken = await AuthTokenModel.authTokenModel.findOneAndDelete(filter).lean();
            if (!authToken) {
                return res.send({
                    message: `error delete token with customerID: ${customerID}`,
                    statusCode: 400,
                    code: "auth/delete-failed",
                    timestamp
                });
            }
            // console.log(authToken);
            return res.send({
                message: `logout success at: ${timestamp}`,
                statusCode: 200,
                code: "auth/delete-success",
                timestamp
            });
        } catch (e) {
            console.log(`auth.token service: delete: ${e.message}`);
            return res.send({
                message: e.message.toString(),
                statusCode: 400,
                code: "auth/create-failed",
                timestamp
            });
        }
    }

}

module.exports = new CustomerService;

