DevWars reddit bot
===========
## Instructions
1. Create a credentials.php file according to the format below and change the subreddit in the ```index.php``` file if needed
2. Set up a cron: ```*/10 * * * * /path/to/index.php```
3. ???
4. Profit

## credentials.php file format
    <?php
    $username = "REDDIT_USERNAME";
    $password = "REDDIT_PASSWORD";
    $email = "EMAIL_FOR_MESSAGES";

    $auth = "REDDIT_APP_ID:REDDIT_APP_SECRET";
    ?>
    
## License
GPL v3
