import { database, ObjectId } from "@spica-devkit/database";

const LIKED_BUCKET_ID = process.env.LIKED_BUCKET_ID;
const COMMENTS_BUCKET_ID = process.env.COMMENTS_BUCKET_ID;
const POSTS_BUCKET_ID = process.env.POSTS_BUCKET;

let db;
export async function deletePost(change) {
    let post = change.previous;
    console.log("post deleted : ", post);
    if (post.post) return false;

    if (!db) db = await database();
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    let commentsBucket = db.collection(`bucket_${COMMENTS_BUCKET_ID}`);

    await likedBucket.deleteMany({ post: { $exists: false } }).catch(console.log);
    await commentsBucket.deleteMany({ post: { $exists: false } }).catch(console.log);
    return true;
}

export async function decreaseLikeCount(change) {
    if (change.previous) {
        let postId = change.previous.post;
        await changePostMetrics(postId, { $inc: { like_count: -1 } });
    }
}

export async function increaseLikeCount(change) {
    let postId = change.document.post;
    await changePostMetrics(postId, { $inc: { like_count: 1 } });
}

export async function decreaseCommentCount(change) {
    if (change.previous) {
        let postId = change.previous.post;
        await changePostMetrics(postId, { $inc: { comment_count: -1 } });
    }
}

export async function increaseCommentCount(change) {
    let postId = change.document.post;
    await changePostMetrics(postId, { $inc: { comment_count: 1 } });
}

async function changePostMetrics(postId, process) {
    if (!db) db = await database();
    await db
        .collection(`bucket_${POSTS_BUCKET_ID}`)
        .updateOne({ _id: ObjectId(postId) }, process)
        .catch(console.log);
}
