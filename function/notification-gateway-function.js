import { database, ObjectId } from "@spica-devkit/database";

const NOTIFICATIONS_BUCKET_ID = process.env.NOTIFICATIONS_BUCKET_ID;
const USERS_BUCKET_ID = process.env.USERS_BUCKET_ID;
const POSTS_BUCKET_ID = process.env.POSTS_BUCKET_ID;
const FOLLOWEDS_BUCKET_ID = process.env.FOLLOWEDS_BUCKET_ID;
const ACTIVITIES_BUCKET_ID = process.env.ACTIVITIES_BUCKET_ID;
const FOLLOWED_POSTS_BUCKET_ID = process.env.FOLLOWED_POSTS_BUCKET_ID;
const HASHTAGS_BUCKET_ID = process.env.HASHTAGS_BUCKET_ID;

let db;

let getLang = {
    en: "en_US",
    tr: "tr_TR",
    ru: "ru"
};

export async function sendPNTaggedPeopleOnPost(change) {

    if (!db) db = await database();
    let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);
    let taggedUsers = change.document.tags;
    await checkHashtags(change.document.hashtags)
    let user = change.document.user;
    user = await usersBucket.findById(user).catch(console.log);
    if (taggedUsers) {
        taggedUsers = await usersBucket
            .find({ _id: { $in: taggedUsers.map(u => ObjectId(u)) } })
            .toArray()
            .catch(console.log);
        await taggedUserNotification(taggedUsers, user, change.document._id)
    }

    if (change.document.post) {
        let postBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);
        let reposted_post = await postBucket.findById(change.document.post).catch(console.log);
        if (reposted_post.user.toString() != user._id.toString())
            addActivity("re_post", reposted_post.user, user._id.toString(), change.document._id, change.document.text || '');
    }
    return;
}
async function taggedUserNotification(taggedUsers, user, postId) {
    for (let taggedUser of taggedUsers) {
        if (taggedUser.notification && taggedUser._id.toString() != user._id.toString()) {
            await addNotification(
                `Social Media`,
                `${user.username} tagged you in a post`,
                taggedUser.fcm_token,
                JSON.stringify({ route: `post`, param: postId, user: taggedUser._id })
            );
        }
        addActivity("tag_in_post", taggedUser._id, user._id.toString(), postId, ``);
    }
}
export async function updatePost(change) {
    await checkHashtags(change.current.hashtags)
    let newTaggedUsers = [];
    change.current.tags.forEach((item) => {
        if (!change.previous.tags.includes(item))
            newTaggedUsers.push(item)
    });

    if (newTaggedUsers.length > 0) {
        if (!db) db = await database();
        let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);
        newTaggedUsers = await usersBucket
            .find({ _id: { $in: newTaggedUsers.map(u => ObjectId(u)) } })
            .toArray()
            .catch(console.log);
        let user = change.current.user;
        user = await usersBucket.findById(user).catch(console.log);
        await taggedUserNotification(newTaggedUsers, user, change.current._id)
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
    if (!db) db = await database();

    let follower = change.document.follower;
    let following = change.document.following;

    let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);

    follower = await usersBucket.findById(follower).catch(console.log);
    following = await usersBucket.findById(following).catch(console.log);
    if (following.notification) {
        let translate_data = await getTranslateByKey("start_follow_you", following.language);
        addNotification(
            "Cloockie",
            `${follower.username + " " + translate_data}`,
            following.fcm_token,
            JSON.stringify({ route: `waiting_requests`, param: follower.identity, user: following._id })
        );
    }

    addActivity("follow_user", String(following._id), String(follower._id));
}
export async function notificationsOnWaitingRequest(change) {
    if (!db) db = await database();

    let sender = change.document.sender;
    let reciever = change.document.reciever;
    let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);
    sender = await usersBucket.findById(sender).catch(console.log);
    reciever = await usersBucket.findById(reciever).catch(console.log);
    if (reciever.notification) {
        addNotification(
            "Cloockie",
            `${sender.username} wants to follow you`,
            reciever.fcm_token,
            JSON.stringify({ route: `waiting_requests`, param: sender.identity, user: reciever._id })
        );
    }

    addActivity("request_user", String(reciever._id), String(sender._id));

}

export async function notificationsOnLikedPost(change) {
    if (!db) db = await database();

    let user = change.document.user;
    let post = change.document.post;

    let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);
    let postsBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);

    user = await usersBucket.findById(user).catch(console.log);
    post = await postsBucket.findById(post).catch(console.log);
    let ownerPost = await usersBucket.findById(post.user).catch(console.log);
    if (ownerPost.notification && ownerPost._id.toString() != user._id.toString()) {
        addNotification(
            "Cloockie",
            `${user.username} liked your post`,
            ownerPost.fcm_token,
            JSON.stringify({ route: `post`, param: post._id, user: ownerPost._id })
        );
    }

    addActivity("like", ownerPost._id, user._id, post._id);
}
export async function notificationsOnCommentPost(change) {
    if (!db) db = await database();
    let user = change.document.user;
    let post = change.document.post;

    let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);
    let postsBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);

    user = await usersBucket.findById(user).catch(console.log);
    post = await postsBucket.findById(post).catch(console.log);
    let ownerPost = await usersBucket.findById(post.user).catch(console.log);
    let taggedUsers = change.document.tags;
    if (taggedUsers) {
        taggedUsers = await usersBucket
            .find({ _id: { $in: taggedUsers.map(u => ObjectId(u)) } })
            .toArray()
            .catch(console.log);
        for (let taggedUser of taggedUsers) {
            if (taggedUser.notification && taggedUser._id.toString() != user._id.toString()) {
                await addNotification(
                    `Social Media`,
                    `${user.username} tagged you in a comment`,
                    taggedUser.fcm_token,
                    JSON.stringify({ route: `post`, param: post._id, user: taggedUser._id })
                );
            }
            addActivity(
                "tag_in_comment",
                taggedUser._id,
                user._id,
                post._id,
                change.document.comment
            );
        }
    }
    if (ownerPost.notification && ownerPost._id.toString() != user._id.toString()) {
        addNotification(
            "Cloockie",
            `${user.username} is commented your post`,
            ownerPost.fcm_token,
            JSON.stringify({ route: `post`, param: post._id, user: ownerPost._id })
        );
    }
    addActivity("comment", ownerPost._id, user._id, post._id, change.document.comment);
}

export async function dailyInactiveUserDigest() {
    let limit = 10;
    let now = new Date();
    let twoDayAgo = new Date(now.getTime() - 24 * 2 * 60 * 60 * 1000);

    if (!db) db = await database();
    let usersBucket = db.collection(`bucket_${USERS_BUCKET_ID}`);
    let postsBucket = db.collection(`bucket_${POSTS_BUCKET_ID}`);
    let friendsBucket = db.collection(`bucket_${FOLLOWEDS_BUCKET_ID}`);
    let notificationsBucket = db.collection(`bucket_${NOTIFICATIONS_BUCKET_ID}`);

    let nonActiveUsers = await usersBucket
        .find({ last_online_date: { $lt: twoDayAgo }, fcm_token: { $exists: true } })
        .limit(limit)
        .toArray()
        .catch(console.log);

    for (let naUser of nonActiveUsers) {
        let friendsOfNonActiveUsers = await friendsBucket
            .find({ follower: naUser._id.toString() })
            .toArray()
            .catch(console.log);

        let findFriendsPosts = await postsBucket
            .find({
                user: { $in: friendsOfNonActiveUsers.map(u => u._id.toString()) },
                created_at: { $gt: twoDayAgo }
            })
            .toArray();

        let postedFriendsCount = friendsOfNonActiveUsers.filter(u =>
            findFriendsPosts.some(p => p.user == u.following)
        );
        let userTimezone = new Date();
        userTimezone.setMinutes(userTimezone.getMinutes() - (naUser.timezone || 0));
        if (postedFriendsCount.length && userTimezone.toTimeString().substring(0, 2) == "17") {
            {
                let latestDigest = await notificationsBucket.find({ token: naUser.fcm_token, created_at: { $lt: new Date(), $gt: twoDayAgo } }).toArray().catch(console.log)
                if (new Date(naUser.last_online_date) < twoDayAgo && !latestDigest.length) {

                    addNotification(
                        "Cloockie",
                        `${postedFriendsCount.length} shared new posts`,
                        naUser.fcm_token,
                        JSON.stringify({ route: `calendar`, param: new Date().toISOString(), user: naUser._id }),
                        "digest"
                    );
                }
            }
        }
    }
}

async function addNotification(title, message, token, data = null, tag = null) {
    let notificationsBucket = db.collection(`bucket_${NOTIFICATIONS_BUCKET_ID}`);
    await notificationsBucket.insertOne({
        title: title,
        body: message,
        token: token,
        data: data,
        tag,
        created_at: new Date()
    });
}

async function addActivity(action, owner, user, post, metadata) {
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
