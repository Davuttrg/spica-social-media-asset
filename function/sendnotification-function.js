import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";

const NOTIFICATION_BUCKET_ID = process.env.NOTIFICATION_BUCKET_ID;
const FIREBASE_BUCKET_ID = process.env.FIREBASE_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const SECRET_API_KEY = process.env.SECRET_API_KEY;

let db;
Bucket.initialize({ apikey: SECRET_API_KEY });
export default async function checkNotifications() {
    let new_date = new Date();
    if (!db) db = await database();
    let insert_objects = [];
    let notificationBucket = db.collection(`bucket_${NOTIFICATION_BUCKET_ID}`);
    let firebaseBucket = db.collection(`bucket_${FIREBASE_BUCKET_ID}`);
    let userBucket = db.collection(`bucket_${USER_BUCKET_ID}`);

    let notifications = await notificationBucket.find({ send_date: { $lt: new_date } }).toArray();
    for (let notification of notifications) {
        let new_obj = {
            title: "Cloockie",
            body: notification.message,
            created_at: new Date()
        };
        if (notification.data) new_obj["data"] = notification.data;
        if (notification.user) {
            let user = await userBucket
                .findOne({ _id: ObjectId(notification.user) })
                .catch(console.log);
            new_obj["token"] = user.fcm_token.toString();
            await notificationBucket
                .deleteOne({ _id: ObjectId(notification._id) })
                .catch(err => console.log("err while delete notification : ", err));
        } else {
            new_obj["topic"] = notification.post;
            await Bucket.data
                .remove(NOTIFICATION_BUCKET_ID, notification._id.toString())
                .catch(e => console.log("error while delete notification", e));
        }
        insert_objects.push(new_obj);
    }
    if (insert_objects.length > 0)
        await firebaseBucket.insertMany(insert_objects).catch(console.log);
    return true;
}
