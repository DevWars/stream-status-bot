<?php
/**
 * /r/DevWars reddit bot
 * Made by Daniel Peukert (http://danielpeukert.cz)
 * GitHub: https://github.com/dpeukert/devwars-reddit-bot
 * Licensed under GPL v3
 */

/* SETTINGS */

require "credentials.php";
$subreddit = "DevWars";
$useragent = "User-Agent: ".$subreddit."_bot/1.0 by ".$username;


/* ERROR LOGGING/HANDLING */

function log_error($message, $quit = true)
{
    mail($email, "Bot error", $message, "To: ".$email."\r\nFrom: redditbot@devwars.tv");
    if($quit)
    {
        exit($message);
    }
    else
    {
        echo $message."<br>";
    }
}


/* OAUTH */

$login = curl_init();
curl_setopt($login, CURLOPT_URL, "https://ssl.reddit.com/api/v1/access_token");
curl_setopt($login, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($login, CURLOPT_POST, TRUE);
curl_setopt($login, CURLOPT_USERPWD, $auth);
curl_setopt($login, CURLOPT_POSTFIELDS, array(
                                           "grant_type"=>"password",
                                           "username"=>$username,
                                           "password"=>$password
                                        ));
$loginoutput = json_decode(curl_exec($login));
$loginerror = curl_errno($login);
curl_close($login);
if($loginerror)
{
    log_error("When authenticating, there was a cURL error code: ".$loginerror);
}
$token = $loginoutput->access_token;


/* GET CURRENT SETTINGS */

$srsettings = curl_init();
curl_setopt($srsettings, CURLOPT_URL, "https://oauth.reddit.com/r/".$subreddit."/about/edit.json");
curl_setopt($srsettings, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($srsettings, CURLOPT_HTTPHEADER,array(
                                                $useragent,
                                                "Authorization: bearer ".$token
                                            ));
$srsettingsoutput = json_decode(curl_exec($srsettings));
$srsettingserror = curl_errno($srsettings);
curl_close($srsettings);
if($srsettingserror)
{
    log_error("When getting subreddit settings, there was a cURL error code: ".$srsettingserror);
}
if(!$srsettingsoutput->data)
{
    log_error("When getting subreddit settings, there was an error.");
}
$srsettingsoutput = $srsettingsoutput->data;
$linkcount = substr_count($srsettingsoutput->description, "[](#devwars)");
if($linkcount != 2)
{
    if($linkcount == 0)
    {
        log_error("There is an error in the sidebar: No link pair found.");
    }
    elseif($linkcount == 1)
    {
        log_error("There is an error in the sidebar: Link pair is not closed.");
    }
    else
    {
        log_error("There is an error in the sidebar: Only one link pair can be used.");
    }
}


/* PROCESS AND USE DEVWARS DB AND TWITCH DATA */

function next_devwars($current,$skip)
{
    $current_date = strftime("%-m/%-d",$current);                           // m/d
    $current_date_year = strftime("%-m/%-d/%Y",$current);                   // m/d/y
    $current_day = strftime("%A",$current);                                 // Monday - Sunday
    $current_hour = strftime("%-H",$current);                               // 0-23
    
    $next_tuesday = strtotime("next Tuesday",$current);
    $next_saturday = strtotime("next Saturday",$current);
    
    if($next_tuesday < $next_saturday)
    {
        
        $day = "Tuesday";
        $next_devwars = $next_tuesday;
    }
    else
    {
        $day = "Saturday";
        $next_devwars = $next_saturday;
    }
    
    $next_devwars_date = strftime("%-m/%-d",$next_devwars);           // m/d - next DevWars
    $next_devwars_date_year = strftime("%-m/%-d/%Y",$next_devwars);   // m/d/y - next DevWars
    
    $is_game_day = (($current_day == "Tuesday" || $current_day == "Saturday") ? true : false);
    
    if($is_game_day && $current_hour < 12)
    {
        $is_game_day_before_game = true;
        
        // x < 12 (00:00-11:59) to account for possible delays
        // not visible if without a delay (DEVWARS LIVE text & DevWars are longer than 2 hours)
        $day = $current_day;
        $date = $current_date." (Today)";
    }
    else
    {
        $is_game_day_before_game = false;
        $date = $next_devwars_date;
    }
    
    foreach($skip as $skipdate)
    {
        // next DevWars skipping - not game day and/or after 12
        // or
        // today's DevWars skipping - game day before 12
        if(($next_devwars_date_year == $skipdate && !$is_game_day_before_game) || ($current_date_year == $skipdate && $is_game_day_before_game))
        {
            return next_devwars(strtotime($skipdate." 12:00"),$skip);
            break;
        }
    }
    return "**Next DevWars:**[](#linebreak) *".$day." ".$date." - 10:00 AM MST*";
}

$twitchdata = json_decode(file_get_contents("https://api.twitch.tv/kraken/streams/DevWars"));

$descriptionparts = explode("[](#devwars)", $srsettingsoutput->description);

if($twitchdata->stream != NULL)
{
    $descriptionparts[1] = "[● DEVWARS LIVE](http://www.twitch.tv/DevWars)";
}
else
{
    date_default_timezone_set("America/Phoenix");
    $skipdates = array("6/6/2015","6/9/2015","6/13/2015","6/16/2015","6/20/2015","6/23/2015");
    $currenttime = time();
    $descriptionparts[1] = next_devwars($currenttime,$skipdates);
}
$descriptionparts = implode("[](#devwars)", $descriptionparts);


/* SEND NEW SETTINGS */

$srsidebar = curl_init();
curl_setopt($srsidebar, CURLOPT_URL, "https://oauth.reddit.com/api/site_admin");
curl_setopt($srsidebar, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($srsidebar, CURLOPT_HTTPHEADER, array(
                                                $useragent,
                                                "Authorization: bearer ".$token
                                            ));
curl_setopt($srsidebar, CURLOPT_POSTFIELDS, array(
                                                "allow_top"=>                 $srsettingsoutput->default_set,
                                                "api_type"=>                  "json",
                                                "collapse_deleted_comments"=> $srsettingsoutput->collapse_deleted_comments,
                                                "comment_score_hide_mins"=>   $srsettingsoutput->comment_score_hide_mins,
                                                "css_on_cname"=>              $srsettingsoutput->domain_css,
                                                "description"=>               $descriptionparts,
                                                "exclude_banned_modqueue"=>   $srsettingsoutput->exclude_banned_modqueue,
                                                "header-title"=>              $srsettingsoutput->header_hover_text,
                                                "lang"=>                      $srsettingsoutput->language,
                                                "link_type"=>                 $srsettingsoutput->content_options,
                                                "name"=>                      $subreddit,
                                                "over_18"=>                   $srsettingsoutput->over_18,
                                                "public_description"=>        $srsettingsoutput->public_description,
                                                "public_traffic"=>            $srsettingsoutput->public_traffic,
                                                "show_cname_sidebar"=>        $srsettingsoutput->domain_sidebar,
                                                "show_media"=>                $srsettingsoutput->show_media,
                                                "spam_comments"=>             $srsettingsoutput->spam_comments,
                                                "spam_links"=>                $srsettingsoutput->spam_links,
                                                "spam_selfposts"=>            $srsettingsoutput->spam_selfposts,
                                                "sr"=>                        $srsettingsoutput->subreddit_id,
                                                "submit_link_label"=>         $srsettingsoutput->submit_link_label,
                                                "submit_text"=>               $srsettingsoutput->submit_text,
                                                "submit_text_label"=>         $srsettingsoutput->submit_text_label,
                                                "title"=>                     $srsettingsoutput->title,
                                                "type"=>                      $srsettingsoutput->subreddit_type,
                                                "wiki_edit_age"=>             $srsettingsoutput->wiki_edit_age,
                                                "wiki_edit_karma"=>           $srsettingsoutput->wiki_edit_karma,
                                                "wikimode"=>                  $srsettingsoutput->wikimode
                                            ));
$uploadoutput = json_decode(curl_exec($srsidebar));
$srsidebarerror = curl_errno($srsidebar);
curl_close($srsidebar);
if($srsidebarerror)
{
    log_error("When uploading changed subreddit settings, there was a cURL error code: ".$srsidebarerror);
}
echo "Success!";
?>
