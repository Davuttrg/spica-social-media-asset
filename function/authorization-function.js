import * as Identity from "@spica-devkit/identity";
import * as Bucket from "@spica-devkit/bucket";
import { database, ObjectId } from "@spica-devkit/database";
import fetch from "node-fetch";
import * as Storage from "@spica-devkit/storage";



const IDENTITIY_SECRET_KEY = process.env.IDENTITIY_SECRET_KEY;
const SECRET_API_KEY = process.env.SECRET_API_KEY;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;

const LIKED_BUCKET_ID = process.env.LIKED_BUCKET_ID;
const FOLLOWED_POST_BUCKET_ID = process.env.FOLLOWED_POST_BUCKET_ID;
const NOTIFICATION_BUCKET_ID = process.env.NOTIFICATION_BUCKET_ID;
const COMMENTS_BUCKET_ID = process.env.COMMENTS_BUCKET_ID;
const POSTS_BUCKET_ID = process.env.POSTS_BUCKET_ID;
const ACTIVITIES_BUCKET_ID = process.env.ACTIVITIES_BUCKET_ID;
const FOLLOWING_BUCKET_ID = process.env.FOLLOWING_BUCKET_ID;
const CHATS_BUCKET_ID = process.env.CHATS_BUCKET_ID;
const MESSAGES_BUCKET_ID = process.env.MESSAGES_BUCKET_ID;

Bucket.initialize({ apikey: SECRET_API_KEY });
Identity.initialize({ apikey: IDENTITIY_SECRET_KEY });
Storage.initialize({ apikey: SECRET_API_KEY });

let db;
export default async function (req, res) {
    let { user } = req.body;
    user.name = user.firstName;
    user.surname = user.lastName;
    user.thumbnail = user.photoUrl;
    let token;
    let resObj = {};

    if (user && user.id) {
        token = await getIdentityToken(user.id, user.id).catch(async error => {
            let identity_id = await createIdentity(user.id, user.id).catch(e => {
                if (e.error.statusCode == 400) {
                    resObj = {
                        status: 400,
                        data: {
                            mesage: "identity_exist", provider: user.provider
                        }
                    }
                    return;
                }
            });
            if (!identity_id) {
                resObj = {
                    status: 400,
                    data: {
                        mesage: "identity_exist", provider: user.provider
                    }
                }
                return;
            }
            identity_id = identity_id._id;
            user.identity = identity_id;
            user.username = await confUsername(user.name, user.surname)

            await createUser(user).catch(e => console.log("error while create user : ", e));
            token = await getIdentityToken(user.id, user.id).catch(err =>
                console.log("error while get identity token :", err)
            );
            resObj = {
                status: 200,
                data: {
                    spica_token: token
                }
            }
        });
        if (token) {
            resObj = {
                status: 200,
                data: {
                    spica_token: token
                }
            }
        }
        return res.status(resObj.status).send(resObj.data);
    }
    return res.status(400).send({ message: "SOMETHING WENT WRONG" });
}
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

async function getIdentityToken(email, password) {
    return await Identity.login(email, password);
}

async function createIdentity(email, password) {
    return await Identity.insert({
        identifier: email,
        password: password,
        policies: [process.env.USER_POLICY_ID],
        attributes: { role: "user" }
    });
}

async function createUser(new_user) {
    if (new_user.thumbnail) {
        const response = await fetch(new_user.thumbnail);
        const buffer = await response.buffer();
        let bufWithMeta = {
            contentType: "image/jpeg",
            data: buffer,
            name: "image",
        };
        let newImage = await Storage.insert(bufWithMeta).catch((e) => console.log("error :", e))
        new_user.thumbnail = newImage[0].url;
    }
    return await Bucket.data.insert(USER_BUCKET_ID, new_user).catch(error => {
        console.log("createUser error : ", error);
        reject({ error: error });
    });
}

export async function deleteAccount(req, res) {
    const { user_id } = req.query;
    if (!db) db = await database();
    let usersColl = db.collection(`bucket_${USER_BUCKET_ID}`);
    let token;
    try {
        token = req.headers.get("authorization").split(" ")[1];
    }
    catch (error) { console.log("err :", error); return res.status(404).send({ message: error }) }
    if (!token) return res.status(404).send({ message: "Authorization Error" });
    let identity = await Identity.verifyToken(token).catch(console.log);
    let user = await usersColl.find({ identity: identity._id }).toArray().catch(console.log);
    user = user[0]
    let notificationBucket = db.collection(`bucket_${NOTIFICATION_BUCKET_ID}`);
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    let followedPostBucket = db.collection(`bucket_${FOLLOWED_POST_BUCKET_ID}`);
    let commentsBucket = db.collection(`bucket_${COMMENTS_BUCKET_ID}`);
    let postBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);
    let activityBucket = db.collection(`bucket_${ACTIVITIES_BUCKET_ID}`);
    let followingBucket = db.collection(`bucket_${FOLLOWING_BUCKET_ID}`);
    let chatsBucket = db.collection(`bucket_${CHATS_BUCKET_ID}`);
    let messagesBucket = db.collection(`bucket_${MESSAGES_BUCKET_ID}`);

    await likedBucket.deleteMany({ user: user._id.toString() }).catch(console.log);
    await followedPostBucket.deleteMany({ user: user._id.toString() }).catch(console.log);
    await commentsBucket.deleteMany({ user: user._id.toString() }).catch(console.log);
    await postBucket.deleteMany({ user: user._id.toString() }).catch(console.log);
    await notificationBucket.deleteMany({ user: user._id.toString() }).catch(console.log);
    await activityBucket.deleteMany({ $or: [{ user: user._id.toString() }, { owner: user._id.toString() }] }).catch(console.log);
    await followingBucket.deleteMany({ $or: [{ following: user._id.toString() }, { follower: user._id.toString() }] }).catch(console.log);
    await messagesBucket.deleteMany({ owner: user._id.toString() }).catch(console.log);

    let chats = await chatsBucket
        .find({ "last_active.user": user._id.toString() })
        .toArray();
    for (let chat of chats) {
        chat.last_active = chat.last_active.filter(item => item.user != user._id.toString())
        chat.managers = chat.managers.filter((item) => item != user._id.toString())
        if (chat.managers.length == 0 && chat.last_active[0]) chat.managers = [chat.last_active[0].user];
        await chatsBucket.updateOne({ _id: ObjectId(chat._id) }, { $set: { last_active: chat.last_active, managers: chat.managers } })
    }
    await usersColl.deleteOne({ "_id": user._id })
    if (users.lenght == 1) //last user of same identities
        await Identity.remove(user.identity)
    return {}
}