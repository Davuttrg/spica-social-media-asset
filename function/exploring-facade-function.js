import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";
const IDENTITY_APIKEY = process.env.IDENTITY_APIKEY;
const USERS_BUCKET = process.env.USERS_BUCKET;
const LIKED_BUCKET_ID = process.env.LIKED_BUCKET;
const POST_BUCKET_ID = process.env.POST_BUCKET;
const BLOCKED_USER_BUCKET_ID = process.env.BLOCKED_USER_BUCKET

let db;
Identity.initialize({ apikey: IDENTITY_APIKEY })
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
    posts = await postsBucket.find({
        _id: { $in: posts.map(p => ObjectId(p._id)) },
        user: { $nin: block_users }
    }).sort({ like_count: -1 }).toArray().catch(console.log);
    posts = shuffle(posts).splice(0, limit)
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

//  ---------HELPER FUNCTIONS END---------
