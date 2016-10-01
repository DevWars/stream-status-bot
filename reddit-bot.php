<?php
/**
 * /r/DevWars reddit bot
 * Made by Daniel Peukert (http://danielpeukert.cz)
 * GitHub: https://github.com/DevWars/reddit-bot
 * Licensed under GPL v3
 */

require_once 'config.php';

$useragent = $subreddit.'_bot/1.0 by '.$username;

function log_error($message, $quit = true)
{
	global $slackurl;
	global $emailto;
	global $emailfrom;
	$exitmessage = $message;
	if($slackurl)
	{
		$slack = curl_init();
		$slackcolor = ($quit ? 'danger' : 'warning');
		$slackoptions = array(
			CURLOPT_URL => $slackurl,
			CURLOPT_RETURNTRANSFER => 1,
			CURLOPT_POST => true,
			CURLOPT_POSTFIELDS => array(
				'payload' => '{"attachments":[{"fallback":"'.$message.'","color":"'.$slackcolor.'","fields":[{"title":"'.$message.'"}]}]}'
			)
		);
		curl_setopt_array($slack, $slackoptions);
		$slackoutput = json_decode(curl_exec($slack));
		$slackerror = curl_errno($slack);
		curl_close($slack);
		if($slackerror)
		{
			$exitmessage = 'Slack connection failed, cURL error code '.$slackerror.'<br>'.$exitmessage;
		}
	}
	if($emailto || $emailfrom)
	{
		if(!mail($emailto, 'Bot error', $message, 'To: '.$emailto.'\r\nFrom: '.$emailfrom))
		{
			$exitmessage = 'Sending email failed<br>'.$exitmessage;
		}
	}
	if($quit)
	{
		exit($exitmessage);
	}
	else
	{
		echo $exitmessage.'<br>';
	}
}

// AUTHENTICATING WITH REDDIT
$login = curl_init();
$loginoptions = array(
	CURLOPT_URL => 'https://ssl.reddit.com/api/v1/access_token',
	CURLOPT_RETURNTRANSFER => 1,
	CURLOPT_POST => true,
	CURLOPT_USERPWD => $auth,
	CURLOPT_POSTFIELDS => array(
		'grant_type' => 'password',
	    'username' => $username,
		'password' => $password
	)
);
curl_setopt_array($login, $loginoptions);
$loginoutput = json_decode(curl_exec($login));
$loginerror = curl_errno($login);
curl_close($login);
if($loginerror)
{
    log_error('Reddit authentication failed, cURL error code '.$loginerror);
}
$token = $loginoutput->access_token;

// GETTTING CURRENT SETTINGS
$settings = curl_init();
$settingsoptions = array(
	CURLOPT_URL => 'https://oauth.reddit.com/r/'.$subreddit.'/about/edit.json',
	CURLOPT_RETURNTRANSFER => 1,
	CURLOPT_HTTPHEADER => array(
		'User-Agent: '.$useragent,
        'Authorization: bearer '.$token
	)
);
curl_setopt_array($settings, $settingsoptions);
$settingsoutput = json_decode(curl_exec($settings));
$settingserror = curl_errno($settings);
curl_close($settings);
if($settingserror)
{
    log_error('Getting subreddit settings failed, cURL error code '.$settingserror);
}
if(!$settingsoutput->data)
{
    log_error('Getting subreddit settings failed');
}
$settingsoutput = $settingsoutput->data;
$linkcount = substr_count($settingsoutput->description, '[](#devwars)');
if($linkcount != 2)
{
    if($linkcount == 0)
    {
        log_error('There is an error in the sidebar: No link pair found.');
    }
    elseif($linkcount == 1)
    {
        log_error('There is an error in the sidebar: Link pair is not closed.');
    }
    else
    {
        log_error('There is an error in the sidebar: Only one link pair can be used.');
    }
}

// PROCESSING AND USING DEVWARS AND TWITCH DATA
$sidebarparts = explode('[](#devwars)', $settingsoutput->description);

$nextgame = json_decode(@file_get_contents('http://devwars.tv/v1/game/nearestgame'))->timestamp;

$twitchdata = json_decode(@file_get_contents('https://api.twitch.tv/kraken/streams/DevWars'));

if($twitchdata->stream != NULL)
{
	$sidebarparts[1] = '[● DEVWARS LIVE](http://www.twitch.tv/DevWars)';
}
else if($nextgame)
{
	date_default_timezone_set('UTC');
	$sidebarparts[1] = '**Next DevWars:**[](#linebreak) *'.date('l, F j - g:i A e',$nextgame/1000).'*';
}
else
{
	$sidebarparts[1] = '**Next DevWars:**[](#linebreak) *Unavailable*';
}

$sidebarparts = implode('[](#devwars)', $sidebarparts);

// UPLOADING NEW SETTINGS
$sidebar = curl_init();
$sidebaroptions = array(
	CURLOPT_URL => 'https://oauth.reddit.com/api/site_admin',
	CURLOPT_RETURNTRANSFER => 1,
	CURLOPT_HTTPHEADER => array(
		'User-Agent: '.$useragent,
        'Authorization: bearer '.$token
	),
	CURLOPT_POSTFIELDS => array(
		'allow_top'=>                 $srsettingsoutput->default_set,
		'api_type'=>                  'json',
		'collapse_deleted_comments'=> $srsettingsoutput->collapse_deleted_comments,
		'comment_score_hide_mins'=>   $srsettingsoutput->comment_score_hide_mins,
		'css_on_cname'=>              $srsettingsoutput->domain_css,
		'description'=>               $sidebarparts,
		'exclude_banned_modqueue'=>   $srsettingsoutput->exclude_banned_modqueue,
		'header-title'=>              $srsettingsoutput->header_hover_text,
		'hide_ads'=>                  $srsettingsoutput->hide_ads,
		'key_color'=>                 $srsettingsoutput->key_color,
		'lang'=>                      $srsettingsoutput->language,
		'link_type'=>                 $srsettingsoutput->content_options,
		'name'=>                      $subreddit,
		'over_18'=>                   $srsettingsoutput->over_18,
		'public_description'=>        $srsettingsoutput->public_description,
		'public_traffic'=>            $srsettingsoutput->public_traffic,
		'show_cname_sidebar'=>        $srsettingsoutput->domain_sidebar,
		'show_media'=>                $srsettingsoutput->show_media,
		'spam_comments'=>             $srsettingsoutput->spam_comments,
		'spam_links'=>                $srsettingsoutput->spam_links,
		'spam_selfposts'=>            $srsettingsoutput->spam_selfposts,
		'sr'=>                        $srsettingsoutput->subreddit_id,
		'submit_link_label'=>         $srsettingsoutput->submit_link_label,
		'submit_text'=>               $srsettingsoutput->submit_text,
		'submit_text_label'=>         $srsettingsoutput->submit_text_label,
		'suggested_comment_sort'=>    $srsettingsoutput->suggested_comment_sort,
		'title'=>                     $srsettingsoutput->title,
		'type'=>                      $srsettingsoutput->subreddit_type,
		'wiki_edit_age'=>             $srsettingsoutput->wiki_edit_age,
		'wiki_edit_karma'=>           $srsettingsoutput->wiki_edit_karma,
		'wikimode'=>                  $srsettingsoutput->wikimode
	)
);
curl_setopt_array($sidebar, $sidebaroptions);
$sidebaroutput = json_decode(curl_exec($sidebar));
$srsidebarerror = curl_errno($sidebar);
curl_close($sidebar);
if($sidebarerror)
{
    log_error('Uploading subreddit settings failed, cURL error code '.$settingserror);
}
echo 'Success!';
?>
