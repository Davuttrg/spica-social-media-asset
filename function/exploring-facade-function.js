import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";
const IDENTITY_APIKEY = process.env.IDENTITY_APIKEY;
const HASTAG_BUCKET_ID = process.env.HASTAG_BUCKET;
const USERS_BUCKET = process.env.USERS_BUCKET;
const LIKED_BUCKET_ID = process.env.LIKED_BUCKET;
const FOLLOWERS_BUCKET_ID = process.env.FOLLOWERS_BUCKET;
const COMMENT_BUCKET_ID = process.env.COMMENT_BUCKET;
const POST_BUCKET_ID = process.env.POST_BUCKET;
const BLOCKED_USER_BUCKET_ID = process.env.BLOCKED_USER_BUCKET

let db;
Identity.initialize({ apikey: IDENTITY_APIKEY })
export async function exploreUsers(req, res) {
    let { limit, skip } = req.query;

    let token = getToken(req.headers.get("authorization"));
    let decodedToken = await tokenVerified(token);
    if (!db) db = await database();
    let userBucket = db.collection(`bucket_${USERS_BUCKET}`);
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    let followers_bucket = db.collection(`bucket_${FOLLOWERS_BUCKET_ID}`);

    let relatedUsers = [];
    let my_followings = [];
    let userId;
    let block_users = [];
    if (decodedToken) {
        let user = await userBucket.findOne({ identity: decodedToken._id }).catch(console.log);
        userId = user._id.toString();
        block_users = await getBlocksUsers(userId);
        my_followings = await followers_bucket
            .find({ follower: userId })
            .toArray()
            .catch(console.log);
        let likedPosts = await likedBucket
            .find({ user: userId })
            .toArray()
            .catch(console.log);
        let likedPostIds = likedPosts.map(likedPost => likedPost.post);

        relatedUsers = await likedBucket
            .find({ post: { $in: likedPostIds } })
            .toArray()
            .catch(console.log);
        relatedUsers = relatedUsers
            .map(likedPost => likedPost.user)
            .filter(user => user != userId && !my_followings.some(fol => fol.following == user));
        relatedUsers = [...new Set(relatedUsers)]; // get unique users
        block_users = block_users.concat(my_followings.map((item) => item.following));
    }

    let aggregation = [
        { $match: { user: { $in: relatedUsers, $nin: block_users } } },
        { $group: { _id: "$user", count: { $sum: 1 }, detail: { $first: "$$ROOT" } } },
        { $sort: { count: -1 } },
        {
            $replaceRoot: {
                newRoot: { $mergeObjects: [{ count: "$count" }, "$detail"] }
            }
        }
    ];

    if (skip) {
        skip = Number(skip);
        aggregation.push({ $skip: skip });
    }

    if (limit) {
        limit = Number(limit);
        aggregation.push({ $limit: limit });
    }

    let posts = await likedBucket
        .aggregate(aggregation)
        .toArray()
        .catch(err => console.log("ERROR 2", err));

    if (limit && posts.length < limit) {
        let randomPostCount = limit - posts.length;
        my_followings = my_followings.map(item => item.following);
        relatedUsers = relatedUsers.concat(my_followings, block_users);
        if (decodedToken) relatedUsers.push(userId);

        let randomPosts = await likedBucket
            .aggregate([
                { $match: { user: { $nin: relatedUsers } } },
                {
                    $group: {
                        _id: "$user",
                        detail: { $first: "$$ROOT" }
                    }
                },
                {
                    $sample: { size: randomPostCount }
                },
                {
                    $replaceRoot: {
                        newRoot: { $mergeObjects: [{ count: "$count" }, "$detail"] }
                    }
                }
            ])
            .toArray()
            .catch(err => console.log("ERROR 3", err));
        posts = posts.concat(randomPosts);
    }

    let users = await userBucket
        .find({ _id: { $in: posts.map(p => ObjectId(p.user)) } })
        .toArray()
        .catch(err => console.log("ERROR 4", err));

    return res.status(200).send(users);
}
async function getBlocksUsers(me) {
    if (!db) db = await database();
    let block_users = [];
    let blocked_user_bucket = db.collection(`bucket_${BLOCKED_USER_BUCKET_ID}`);
    block_users = await blocked_user_bucket.find({
        $or: [{ blocked: me }, { blocking: me }]
    }).toArray().catch(console.log);
    block_users = block_users.map((item) => item.blocked == me ? item.blocking : item.blocked)
    block_users = [...new Set(block_users)];
    return block_users

}
export async function explorePosts(req, res) {
    let { limit } = req.query;
    limit = Number(limit);
    let token = getToken(req.headers.get("authorization"));
    let decodedToken = await tokenVerified(token);

    if (!db) db = await database();

    let userBucket = db.collection(`bucket_${USERS_BUCKET}`);
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    let postsBucket = db.collection(`bucket_${POST_BUCKET_ID}`);
    let user = await userBucket.findOne({ identity: decodedToken._id }).catch(console.log);
    let userId = user._id.toString();
    let block_users = await getBlocksUsers(userId);

    if (!limit) limit = 5;

    let aggregation = [
        { $match: { user: { $nin: block_users } } },
        { $group: { _id: "$post", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit * 100 },
        {
            $sample: { size: limit * 10 }
        }
    ];

    let likedPosts = await likedBucket
        .find({ user: userId })
        .toArray()
        .catch(console.log);


    let relatedUsers;
    if (likedPosts.length > 0) {
        let likedPostIds = likedPosts.map(likedPost => likedPost.post);

        relatedUsers = await likedBucket
            .find({ post: { $in: likedPostIds } })
            .toArray()
            .catch(console.log);

        relatedUsers = relatedUsers.map(likedPost => likedPost.user).filter(user => user != userId);
        aggregation.unshift({ $match: { user: { $in: relatedUsers, $nin: block_users } } });
    }
    let posts = await likedBucket
        .aggregate(aggregation)
        .toArray()
        .catch(err => console.log("ERROR 2", err));

    let notExpiredPosts = await postsBucket.find({
        _id: { $in: posts.map(p => ObjectId(p._id)) },
        event_date: { $gt: new Date() },
        user: { $nin: block_users }
    }).sort({ like_count: -1 }).toArray().catch(console.log);
    notExpiredPosts = uniqueByUser(shuffle(notExpiredPosts));
    posts = notExpiredPosts.splice(0, limit);
    return res.status(200).send({ posts });
}

export async function trendingPosts(req, res) {
    const { limit, skip } = req.query;
    let token = getToken(req.headers.get("authorization"));
    let decodedToken = await tokenVerified(token);
    if (!db) db = await database();
    let block_users = [];
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    if (decodedToken) {
        let userBucket = db.collection(`bucket_${USERS_BUCKET}`);
        let user = await userBucket.findOne({
            identity: decodedToken._id
        });
        block_users = await getBlocksUsers(user._id.toString());
    }

    let lastDay = new Date();
    lastDay.setDate(lastDay.getDate() - 3);

    let aggregation = [
        { $match: { created_at: { $gt: lastDay }, user: { $nin: block_users } } },
        { $group: { _id: "$post", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ];
    if (skip) {
        aggregation.push({ $skip: Number(skip) });
    }

    if (limit) {
        aggregation.push({ $limit: Number(limit) * 3 });
    }
    let posts = await likedBucket
        .aggregate(aggregation)
        .toArray()
        .catch(err => console.log("ERROR 39", err));

    let postsBucket = db.collection(`bucket_${POST_BUCKET_ID}`);
    let imageCheckedPosts = await postsBucket
        .find({ $and: [{ "file.url": { $exists: true } }, { "file.mimeType": { $ne: "iframe" } }], _id: { $in: posts.map(p => ObjectId(p._id)) }, user: { $nin: block_users } })
        .toArray()
        .catch(console.log);

    posts = posts.filter(p => imageCheckedPosts.some(ip => ip._id == p._id));
    posts = posts.splice(0, limit);

    return res.status(200).send({ posts });
}
//  ---------HELPER FUNCTIONS---------
function getToken(token) {
    if (token) {
        token = token.split(" ")[1];
    } else {
        token = "";
    }

    return token;
}

async function tokenVerified(token) {
    let decodedToken = null;
    try {
        decodedToken = await Identity.verifyToken(token)
    } catch (err) {
        console.log("Error while decoding token", err);
    }

    return decodedToken;
}

function shuffle(array) {
    var currentIndex = array.length,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

function uniqueByUser(array) {
    let result = [];
    for (let object of array) {
        if (result.filter(r => r.user == object.user).length == 0)
            result.push(object);
    }
    return result;
}
//  ---------HELPER FUNCTIONS END---------

export async function getClassifiedPosts(req, res) {
    let { limit, skip } = req.query;

    let token = getToken(req.headers.get("authorization"));
    let decodedToken = await tokenVerified(token);
    if (!db) db = await database();
    let userBucket = db.collection(`bucket_${USERS_BUCKET}`);
    let likedBucket = db.collection(`bucket_${LIKED_BUCKET_ID}`);
    let hashtagBucket = db.collection(`bucket_${HASTAG_BUCKET_ID}`);
    let followers_bucket = db.collection(`bucket_${FOLLOWERS_BUCKET_ID}`);
    let commentBucket = db.collection(`bucket_${COMMENT_BUCKET_ID}`);
    let postBucket = db.collection(`bucket_${POST_BUCKET_ID}`);
    let user = await userBucket.findOne({
        identity: decodedToken._id
    });
    let userId = user._id.toString();
    let block_users = await getBlocksUsers(userId);
    let userFriendIds = await followers_bucket
        .find({ follower: userId })
        .toArray()
        .catch(console.log);
    userFriendIds = userFriendIds.map(user => user.following);
    let today = new Date();
    today.setHours(0);
    today.setMinutes(0);
    today.setSeconds(0);
    let aDayAgo = new Date();
    aDayAgo.setDate(aDayAgo.getDate() - 1);
    let userFriendIdsWithMe = [...userFriendIds];
    userFriendIdsWithMe.push(userId);
    let posts = await postBucket
        .find({
            user: { $in: userFriendIdsWithMe, $nin: block_users },
            $and: [
                {
                    $or: [
                        { visibility: "public" },
                        {
                            $and: [
                                { visibility: "tagged_users" },
                                {
                                    $or: [{ tags: { $in: [userId] } }, { user: userId }]
                                }
                            ]
                        }
                    ]
                },
                {
                    $or: [{ created_at: { $gt: aDayAgo } }, { event_date: { $gt: new Date() } }]
                }
            ]
        })
        .sort({ event_date: 1 })
        .toArray()
        .catch(console.log);

    let friendsLikes = await likedBucket
        .find({
            user: { $in: userFriendIds, $nin: block_users },
            created_at: { $gt: today }
        })
        .toArray()
        .catch(console.log);

    let now = new Date();
    let twoDayAgo = new Date(now.getTime() - 24 * 3 * 60 * 60 * 1000);
    let friendsComments = await commentBucket
        .find({
            user: { $in: userFriendIds, $nin: block_users },
            date: { $gt: twoDayAgo }
        })
        .toArray()
        .catch(console.log);

    let mergedArray = [
        ...posts.map(p => p._id.toString()),
        ...friendsComments.map(p => p.post),
        ...friendsLikes.map(p => p.post)
    ];

    let uniqueArray = [...new Set(mergedArray)];
    uniqueArray = uniqueArray.splice(skip, limit);

    let friendsCommentsIds = uniqueArray
        .map(item => (item = friendsComments.filter(i => i.post == item)[0]))
        .filter(p => p != null);
    uniqueArray = uniqueArray.filter(ua => !friendsCommentsIds.some(p => p.post == ua));
    for (let comment of friendsCommentsIds) {
        if (comment.hastags)
            comment.hastags = await hashtagBucket
                .find({
                    _id: { $in: comment.hastags.map(item => ObjectId(item)) }
                })
                .toArray();
        if (comment.tags)
            comment.tags = await userBucket
                .find({
                    _id: { $in: comment.tags.map(item => ObjectId(item)) }
                })
                .toArray();
    }
    let friendsLikesIds = uniqueArray
        .map(item => (item = friendsLikes.filter(i => i.post == item)[0]))
        .filter(p => p != null);
    uniqueArray = uniqueArray.filter(ua => !friendsLikesIds.some(p => p.post == ua));

    return res.status(200).send({
        posts: uniqueArray,
        likes: friendsLikesIds,
        comments: friendsCommentsIds
    });
}
