import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";
import fetch from "node-fetch";
const cheerio = require("cheerio");
const CHATS_BUCKET_ID = process.env.CHATS_BUCKET_ID;
const USERS_BUCKET_ID = process.env.USERS_BUCKET_ID;
const IDENTITIY_SECRET_KEY = process.env.IDENTITIY_SECRET_KEY;

let db;
Identity.initialize({ apikey: IDENTITIY_SECRET_KEY });

export default async function (req, res) {
    let { object, params } = req.body;
    const token = req.headers.get("authorization").split(" ")[1];
    if (!db) db = await database();

    let usersColl = db.collection(`bucket_${USERS_BUCKET_ID}`);
    let identity = await Identity.verifyToken(token).catch(console.log);
    let user = await usersColl.find({ identity: identity._id }).toArray().catch(console.log);
    user = users[0]
    if (object == "chat") {
        let chatsColl = db.collection(`bucket_${CHATS_BUCKET_ID}`);
        let chat = await chatsColl.findById(params.chat).catch(console.log);
        if (params.last_message) {
            chat.last_message_time = new Date();
            chat.last_message = params.last_message;
            chat.last_message_owner = user._id.toString();
        }
        chat.last_active = chat.last_active.map(la => {
            if (la.user == user._id.toString()) {
                la.date = new Date();
                la.unread_messages_count = 0;
                if (la.status == "deleted" && params.last_message) la.status = "active";
            } else {
                if (params.last_message) la.unread_messages_count += 1; //This is a new message
            }
            return la;
        });
        await chatsColl.replaceOne({ _id: chat._id }, chat).catch(console.log);
    } else {
        await usersColl
            .updateOne(
                { _id: ObjectId(user._id) },
                { $set: { last_online_date: new Date(), timezone: Number(params.timezone) } }
            )
            .catch(console.log);
    }

    return res.status(200).send(true);
}
export async function getSharedData(req, res) {
    const { url } = req.query;
    let metadata = {};
    await fetch(url, { headers: { "User-Agent": "Bot" } }) //
        .then(response => response.text())
        .then(text => {
            try {
                const parse = cheerio.load(text);
                metadata.description = parse("meta[property='og:description']")[0]
                    ? parse("meta[property='og:description']")[0].attribs.content.split("“").join("").split("”").join("")
                    : "";
                metadata["site_name"] = parse("meta[property='og:site_name']")[0]
                    ? parse("meta[property='og:site_name']")[0].attribs.content
                    : "";
                metadata["title"] = parse("meta[property='og:title']")[0]
                    ? parse("meta[property='og:title']")[0].attribs.content
                    : "";
                metadata["image"] = parse("meta[property='og:image']")[0]
                    ? parse("meta[property='og:image']")[0].attribs.content
                    : "";
                metadata["video_url"] = parse("meta[property='og:video:url']")[0]
                    ? parse("meta[property='og:video:url']")[0].attribs.content
                    : "";
                metadata["url"] = url;
                if (metadata["video_url"]) {
                    metadata['file'] = {};
                    metadata['file']['url'] = metadata["video_url"];
                    metadata['file']['mimeType'] = "iframe";
                } else if (metadata["image"]) {
                    metadata['file'] = {};
                    metadata['file']['url'] = metadata["image"];
                    metadata['file']['mimeType'] = "image/" + metadata["image"].substr(
                        metadata["image"].lastIndexOf(".") + 1,
                        metadata["image"].length
                    ).split(":")[0];
                }
                var pathArray = url.split("/");
                var protocol = pathArray[0];
                var host = pathArray[2];
                metadata["icon"] = protocol + "//" + host + "/favicon.ico";
            } catch (e) {
                console.log(e);
            }
        });

    return res.status(200).send(metadata);
}
