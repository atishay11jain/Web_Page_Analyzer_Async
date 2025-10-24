We are creating a web page analyzer tool.

Components needed for this architecture.

1- A web server which will expose an api endpoint where user can submit there webpge url.
2- A queue where the request can be reserved for the backgeround worker.
3- A background worker which will process each url and will fetch the html content from the webpage
4- A storage where the result of the background worker can be stored
5- An api endpoint from the web server itself where user can see the status of there webpage url analyzer.

Lets Think about
Web Server and Its first api endpoint :-

POST /api/analyse
Request Body: { "url": "https://example.com" }

1- Validate the req.body.
2- Then do regex matching for url.
3- Should we also need to check whether the input url is available or not, because if url is not available, then passing that url to background worker doesn't make sense,
I think to check whether a url is available or not we need to make a network call which will be time consuming so if this is done at web server end then it will increase the latency of this api which we dont want So checking the url availability will be the first thing need to be done at the background worker end.
4- Now Once we have validate url pattern, then we need to create a unique job_id.
5- For large scalable system , job_id creation must include timestamp in it.
6- Now after jobId creation we have two things push message in queue and return response.

Pushing message in queue if done asynchronously then how we will ensure that always message is pushed in queue, what if queue is down and we have returned 202 to user. Need to think this?
If queue is down then we will not be able to push message and when user will ask for status what he will be getting ??.

I think everytime we create job_id we should mark an entry in our database that for a job_id

1. if message is received by worker - then Status Processing
2. if worker given some error - then Status Failed'
3. if worker has given sucess - then Status Success.

What if the message has not been received by worker then ?
if job_id exist without any status that means message has been lost from queue and we can Say Sorry Unable to process request pls retry.

Second option in this case, Create Job Id and push message in queue and then return 202. Synchronous Processing. Simple but increase latency.

-- Will take call on this

Now lets build the background worker.

1- How exactly background worker will fetch the input msg from queue, like it will be queue specific. So will read about it and will understand it.
2- Once msg is received by BW (Background Worker) - it will mark the status processing and invoke the url and will fetch the response
We will need some library to parse the html output and get the html tags, h1, body etc.
3- Based on this library response we will update the status and data inside our Database against that Job_Id.

Now Suppose we are pushing 1k objects in queue every sec then our BW can't process msg one by one, either we have to create multiple instances of BW or at code level will need some way to keep on reading msg from queue at high speed.

At our web_server we will need one more endpoint
/api/results/{job_id}

So this endpoint will let user to see the status of its request.

1- If provided job_id not exist
2- Job_Id present but status is empty
3- Job_Id with some status.

But there is one issue that if queue has 1Lac record then how we will differentiate that the msg is lost or msg chance of processing hasn't come yet.

So I think pushing msg in queue will be aync await -> once msg is pushed then return 202 from first api.
And job_Id default status will be processing.

---

Now one last thing that If worker invoke the api and we get
5XX - Server Error then we should push the msg in dlq. So that after 5 mins retry could be done. Make this retry mechanism in exponential form till 30mins Or 1 hr Max.

Also what if processing at BW end, gets stopped suddenly because of some failure, how will handle this.
