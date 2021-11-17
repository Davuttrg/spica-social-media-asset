import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";


const POST_BUCKET_ID = process.env.POST_BUCKET;
const LIKED_BUCKET_ID = process.env.LIKED_BUCKET_ID;
const FOLLOWED_POST_BUCKET_ID = process.env.FOLLOWED_POST_BUCKET_ID;
const IDENTITY_APIKEY = process.env.IDENTITY_APIKEY;
let db;
Identity.initialize({ apikey: IDENTITY_APIKEY })

export async function onUserNameChanged(change) {

    if (change.previous.username != change.current.username) {
        if (!db) db = await database();
        let postCollection = db.collection(`bucket_${POST_BUCKET_ID}`);
        let posts = await postCollection.find({ tags: change.current._id }).toArray();
        let regex = new RegExp("@" + change.previous.username, 'gi');
        posts.forEach(p => {
            p.text = p.text.replace(regex, "@" + change.current.username);
            postCollection.updateOne({ _id: ObjectId(p._id) }, { $set: { text: p.text } }).then().catch(console.log);
        });
    }
}

export async function blockUser(change) {
    const blocking = change.current.blocking;
    const blocked = change.current.blocked;
    if (!db) db = await database();
    let postCollection = db.collection(`bucket_${POST_BUCKET_ID}`);
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    let followedPostBucket = db.collection(`bucket_${FOLLOWED_POST_BUCKET_ID}`);
    let myLikes = await likedBucket.find({ user: blocking }).toArray().catch(console.log);
    let myFollows = await followedPostBucket.find({ user: blocking }).toArray().catch(console.log);
    let likedPosts = await postCollection
        .find({ _id: { $in: myLikes.map(p => ObjectId(p.post)) } })
        .toArray()
        .catch(console.log);
    let followPosts = await postCollection
        .find({ _id: { $in: myFollows.map(p => ObjectId(p.post)) } })
        .toArray()
        .catch(console.log);
    let willUnLikedPosts = likedPosts.filter((item) => item.user == blocked);
    let willUnFollowedPosts = followPosts.filter((item) => item.user == blocked);
    await likedBucket.deleteMany({ user: blocking, post: { $in: willUnLikedPosts.map((item) => item._id) } }).catch(console.log);
    await followedPostBucket.deleteMany({ user: blocking, post: { $in: willUnFollowedPosts.map((item) => item._id) } }).catch(console.log);
    return
}
