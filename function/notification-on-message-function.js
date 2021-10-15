import { database, ObjectId } from "@spica-devkit/database";

const USERS_BUCKET_ID = process.env.USERS_BUCKET_ID;
const CHATS_BUCKET_ID = process.env.CHATS_BUCKET_ID;
const NOTIFICATIONS_BUCKET_ID = process.env.NOTIFICATIONS_BUCKET_ID;

let db;
export default async function (change) {
    const chatID = change.document.chat;
    const message = change.document.message;
    let sender = change.document.owner;

    if (!db) db = await database();
    const chatsBucket = db.collection(`bucket_${CHATS_BUCKET_ID}`);
    const notificationsBucket = db.collection(`bucket_${NOTIFICATIONS_BUCKET_ID}`);
    const usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);

    let chatGroup = await chatsBucket.findById(chatID);
    let groupUsers = await usersBucket
        .find({ _id: { $in: chatGroup.last_active.map(item => ObjectId(item.user)) } })
        .toArray();
    sender = groupUsers.filter(u => u._id.toString() == sender);
    sender = sender[0];

    for (let user of groupUsers) {
        if (user._id.toString() != sender._id.toString() && user.notification)
            notificationsBucket.insertOne({
                title: sender.name + " " + sender.surname,
                body: message,
                token: user.fcm_token,
                tag: "message_" + sender._id.toString(),
                created_at: new Date(),
                data: JSON.stringify({ route: `chat`, param: chatGroup._id,user:user._id })
            });
    }

    return;
}
