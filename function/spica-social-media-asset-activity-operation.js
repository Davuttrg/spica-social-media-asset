import { database, ObjectId } from "@spica-devkit/database";

const POSTS_BUCKET_ID = process.env.POSTS_BUCKET_ID;
const ACTIVITIES_BUCKET_ID = process.env.ACTIVITIES_BUCKET_ID;
const HASHTAGS_BUCKET_ID = process.env.HASHTAGS_BUCKET_ID;

let db;
export async function insertPost(change) {
	if (!db) db = await database();
	let taggedUsers = change.document.tags;
	await checkHashtags(change.document.hashtags)
	if (taggedUsers) {
		for (let taggedUser of taggedUsers) {
			addActivity("tag_in_post", taggedUser, change.document.user, change.document._id, ``);
		}
	}
}

async function checkHashtags(hashtags) {
	if (!db) db = await database();
	let hashtagBucket = db.collection(`bucket_${HASHTAGS_BUCKET_ID}`);
	let postBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);
	if (hashtags) {
		let usedPosts = await postBucket
			.find({ hashtags: { $in: hashtags } }).toArray()
		for (let hashtag of hashtags) {
			let hashtagcount = usedPosts.filter((item) => item.hashtags.includes(hashtag));
			await hashtagBucket.updateOne({ _id: ObjectId(hashtag) }, { $set: { "times_used": hashtagcount.length } })
		}
	}

}

export async function notificationsOnFollowUser(change) {
	addActivity("follow_user", String(change.document.following), String(change.document.follower));
}
export async function notificationsOnWaitingRequest(change) {
	addActivity("request_user", String(change.document.reciever), String(change.document.sender));
}

export async function notificationsOnLikedPost(change) {
	if (!db) db = await database();
	let post = change.document.post;
	let postsBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);
	post = await postsBucket.findById(post).catch(console.log);
	addActivity("like", post.user, change.document.user, post._id);
}
export async function notificationsOnCommentPost(change) {
	if (!db) db = await database();
	let post = change.document.post;
	let postsBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);
	post = await postsBucket.findById(post).catch(console.log);
	let taggedUsers = change.document.tags;
	if (taggedUsers) {
		for (let taggedUser of taggedUsers) {
			addActivity(
				"tag_in_comment",
				taggedUser,
				change.document.user,
				post._id,
				change.document.comment
			);
		}
	}
	addActivity("comment", post.user, change.document.user, post._id, change.document.comment);
}

async function addActivity(action, owner, user, post, metadata) {
	if (!db) db = await database();
	if (String(owner) != String(user)) {
		let activitiesBucket = db.collection(`bucket_${ACTIVITIES_BUCKET_ID}`);
		await activitiesBucket
			.insertOne({
				action: action,
				owner: String(owner),
				user: String(user),
				post: post ? String(post) : undefined,
				metadata: metadata || "",
				seen: false,
				created_at: new Date()
			})
			.catch(err => console.log("ERROR 1", err));
	}
}
