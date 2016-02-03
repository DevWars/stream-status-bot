<?php
/**
 * /r/DevWars reddit bot
 * Made by Daniel Peukert (http://danielpeukert.cz)
 * GitHub: https://github.com/dpeukert/devwars-subreddit-bot
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


/* PROCESS AND USE DEVWARS AND TWITCH DATA */

$descriptionparts = explode("[](#devwars)", $srsettingsoutput->description);

$nextgame = json_decode(file_get_contents("http://devwars.tv/v1/game/nearestgame"))

$twitchdata = json_decode(file_get_contents("https://api.twitch.tv/kraken/streams/DevWars"));

if($twitchdata->stream != NULL)
{
	$descriptionparts[1] = "[● DEVWARS LIVE](http://www.twitch.tv/DevWars)";
}
else if($nextgame != NULL)
{
	date_default_timezone_set("UTC");
	$descriptionparts[1] = "**Next DevWars:**[](#linebreak) *".date("l, F j - g:i A e",$nextgame->timestamp/1000)."*";
}
else
{
	$descriptionparts[1] = "**Next DevWars:**[](#linebreak) *Unavailable*";
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
                                                "hide_ads"=>                  $srsettingsoutput->hide_ads,
                                                "key_color"=>                 $srsettingsoutput->key_color,
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
                                                "suggested_comment_sort"=>    $srsettingsoutput->suggested_comment_sort,
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
