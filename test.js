var botId = "st-7d2ac320-109a-5721-8a1f-60a5faab9b71";
var botName = "Book Movie Tickets";
var sdk = require("./lib/sdk");
var botVariables = {};
var langArr = require('./config.json').languages;
var _ = require('lodash');
var dataStore = require('./dataStore.js').getInst();
var debug = require('debug')("Agent");
var first = true;
var sdk                 = require("./lib/sdk");
var api                 = require('./LiveChatAPI.js');
var _                   = require('lodash');
var config              = require('./config.json');
const { makeHttpCall } = require("./makeHttpCall.js");
var debug               = require('debug')("Agent");
var _map                = {}; //used to store secure session ids //TODO: need to find clear map var
var userDataMap         = {};//this will be use to store the data object for each user

/*
 * This is the most basic example of BotKit.
 *
 * It showcases how the BotKit can intercept the message being sent to the bot or the user.
 *
 * We can either update the message, or chose to call one of 'sendBotMessage' or 'sendUserMessage'
 */
/**
 * connectToAgent
 *
 * @param {string} requestId request id of the last event
 * @param {object} data last event data
 * @returns {promise}
 */
function connectToAgent(requestId, data, cb){
    var formdata = {};
    formdata.licence_id = config.liveagentlicense;
    formdata.welcome_message = "";
    var visitorId = _.get(data, 'channel.channelInfos.from');
    if(!visitorId){
        visitorId = _.get(data, 'channel.from');
    }
    userDataMap[visitorId] = data;
    data.message="An Agent will be assigned to you shortly!!!";
    sdk.sendUserMessage(data, cb);
    formdata.welcome_message = "Link for user Chat history with bot: "+ config.app.url +"/history/index.html?visitorId=" + visitorId;
    return api.initChat(visitorId, formdata)
         .then(function(res){
             _map[visitorId] = {
                 secured_session_id: res.secured_session_id,
                 visitorId: visitorId,
                 last_message_id: 0
            };
        });
}

/*
 * onBotMessage event handler
 */
function onBotMessage(requestId, data, cb){
    debug("Bot Message Data",data);
    var visitorId = _.get(data, 'channel.from');
    var entry = _map[visitorId];
    if(data.message.length === 0 || data.message === '') {
        return;
    }
    var message_tone = _.get(data, 'context.dialog_tone');
    if(message_tone && message_tone.length> 0){
        var angry = _.filter(message_tone, {tone_name: 'angry'});
        if(angry.length){
            angry = angry[0];
            if(angry.level >=2){
                connectToAgent(requestId, data);
            }
            else {
                sdk.sendUserMessage(data, cb);
            }
        }
        else {
            sdk.sendUserMessage(data, cb);
        }
    }
    else if(!entry)
    {
        sdk.sendUserMessage(data, cb);
    }else if(data.message === "skipUserMessage"){ // condition for skipping a user message
	sdk.skipUserMessage(data, cb);
    }
}

/*
 * OnUserMessage event handler
 */
function onUserMessage(requestId, data, cb){
    debug("user message", data);
    var visitorId = _.get(data, 'channel.from');
    var entry = _map[visitorId];
    if(entry){//check for live agent
        //route to live agent
        var formdata = {};
        formdata.secured_session_id = entry.secured_session_id;
        formdata.licence_id = config.liveagentlicense;
        formdata.message = data.message;
        return api.sendMsg(visitorId, formdata)
            .catch(function(e){
                console.error(e);
                delete userDataMap[visitorId];
                delete _map[visitorId];
                return sdk.sendBotMessage(data, cb);
            });
    }
    else {
	if(data.message === "skipBotMessage") // condition for skipping a bot message
            return sdk.skipBotMessage(data, cb);
        else    
            return sdk.sendBotMessage(data, cb);
    }
}

/*
 * OnAgentTransfer event handler
 */
function onAgentTransfer(requestId, data, callback){
    connectToAgent(requestId, data, callback);
}

module.exports = {
    botId: botId,
    botName: botName,

    on_user_message :async function(requestId, data, callback) {
        console.log('data', data);
        if(data?.channel?.attachments?.length){
            let response = await makeHttpCall('get',data?.channel?.attachments[0]?.url?.fileUrl)
            const buffer = Buffer.from(response.data, 'binary');
            console.log(buffer)
        }
        debug('on_user_message');
        onUserMessage(requestId, data, callback);
    },
    on_bot_message : function(requestId, data, callback) {
        debug('on_bot_message');
        onBotMessage(requestId, data, callback);
    },
    on_agent_transfer : function(requestId, data, callback) {
        debug('on_webhook');
        onAgentTransfer(requestId, data, callback);
    },
    on_event: function(requestId, data, callback) {
        fetchAllBotVariables(data);
        return callback(null, data);
    },
    on_alert: function(requestId, data, callback) {
        fetchAllBotVariables(data);
        return sdk.sendAlertMessage(data, callback);
    },
    on_variable_update: function(requestId, data, callback) {
        var event = data.eventType;
        if (first || event == "bot_import" || event == "variable_import" || event == "sdk_subscription" || event == "language_enabled") {
            // fetch BotVariables List based on language specific when there is event subscription/bulkimport
            sdk.fetchBotVariable(data, langArr, function(err, response) {
                dataStore.saveAllVariables(response, langArr);
                first = false;
            });
        } else {
            var lang = data.language;
            //update Exixting BotVariables in Storage
            updateBotVariableInDataStore(botVariables, data, event, lang);
        }
        console.log(dataStore);

    }

};

function updateBotVariableInDataStore(botVariables, data, event, lang) {
    var variable = data.variable;
    if (event === "variable_create") {
        //update storage with newly created variable
        for (var i = 0; i < langArr.length; i++) {
            dataStore.addVariable(variable, i);
        }
    } else if (event == "variable_update") {
        //update storage with updated variable
        var index = langArr.indexOf(lang);
        if (index > -1) {
            dataStore.updateVariable(variable, langArr, index);
        }
    } else if (event == "variable_delete") {
        //delete variable from storage
        dataStore.deleteVariable(variable, langArr);
    }
}

function fetchAllBotVariables(data) {
    if (first) {
        sdk.fetchBotVariable(data, langArr, function(err, response) {
            first = false;
            dataStore.saveAllVariables(response, langArr);
        });
    }
}