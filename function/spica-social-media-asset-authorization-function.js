import * as Identity from "@spica-devkit/identity";
import * as Bucket from "@spica-devkit/bucket";


const IDENTITIY_SECRET_KEY = process.env.IDENTITIY_SECRET_KEY;
const SECRET_API_KEY = process.env.SECRET_API_KEY;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;

Bucket.initialize({ apikey: SECRET_API_KEY });
Identity.initialize({ apikey: IDENTITIY_SECRET_KEY });

export async function register(req, res) {
    let { user_data } = req.body;
    console.log("registiration start with this parameter : ", user_data);

    if (user_data.email && user_data.password) {
        let identity = await Identity.insert({
            identifier: user_data.email,
            password: user_data.password,
            policies: ["IdentityReadOnlyAccess", "BucketFullAccess", "StorageFullAccess"] // --custom
        }).catch(err => {
            console.log(err);
            return err;
        });

        if (identity._id) {
            user_data['username'] = await confUsername(user_data.name, user_data.surname)
            console.log("user_data :", user_data)
            let user = await Bucket.data.insert(USER_BUCKET_ID, {
                ...user_data,
                identity_id: identity._id,
            });
            return res.status(200).send({ message: "Registration successful", data: user._id });
        } else {
            return res.status(400).send({ message: identity.message });
        }
    }
    return res.status(400).send({ message: "Invalid email or password provided" });
}
//----Helper Function
async function confUsername(name, surname) {
    let username = (name || "").toLowerCase() + (surname || "").toLowerCase();
    username = username.split(" ").join("");
    let existUser = await Bucket.data.getAll(USER_BUCKET_ID, {
        queryParams: {
            filter: { username: username }
        }
    });
    if (existUser[0] || username.length < 3) {
        username += new Date().toISOString().split(".")[1].split("Z")[0]
            .split(" ")
            .join("");
    }
    return username
}