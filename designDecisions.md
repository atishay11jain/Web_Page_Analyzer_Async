To build Web Page Analyzer

I need to find out the system architecture components.

- Teck Stack
- Install Docker And Setup
- Messaging Queue
- Background Worker Library
- Database
- Testing
- Error Handling
- Scalability Issues and System Possible Bottlenecks

Tech Stack - Python FastApi vs Node Express.js

I know Node.js and has more hands on experience in that.
Node.js excels at I/O-bound tasks (fetching URLs, parsing HTML)

FastAPI is one of the fastest Python frameworks, comparable to Node.js and Go. For an API that needs to handle many requests, this matters.
Python's ecosystem for HTML parsing (BeautifulSoup) is superior to other alternatives.

As a project with tight deadline I will go with node.js because I have hands on command on it and that will help me in debugging the things easily for now.

Tech Stack :- Node.js with Express API Server

---

Now for messaging queues :-

Redis In memory vs Rabbitmq

Rabbitmq has complex setup for this case it will overkill.
Redis is extremely fast for queue operations and Easy to deploy and maintain, especially in Docker.

For Storing the results

As the response of the html parser will be in json and we don't have any relationship among the data So using RDBMS doesn't make sense in this
case.
Now

MongoDB vs Redis

If we use mongoDB then It would be pretty simple and straightforward. Create document for each job_id and store input url, response and status
inside that document only.
Will just need to setup this.

Can we use Redis as storage for now.
One thing is clear that we are gonnna read data always using a job_id
So if we have job_id as key and a Object { url: "", status: "", result: {html_response}} as value then using redis will make system very fast.
Read, Update and insert will be in O(1).

As currently all your api endpoints will filter data using job_id, we can go with redis.
Also web analyzer is somewhat similar to shortenUrl where user will not look for old data instead they will make new queries, So we will store data
in redis using TTL as 1 or 2Day So data cleaning or backup will also not required.

-- In future if we need more filtaration based on url or time then we should move with mongoDB.
-- As redis is in-memory and fast this will cost more compare to mongoDB, So if these factors somes in picture then we can move to mongoDB also.
-- And if business need data to be persistent then also we will have to move to mongoDB.

Node.js + Express + Redis For queue + Redis For Storage.
