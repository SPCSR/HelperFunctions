///<reference path="typings/sharepoint/SharePoint.d.ts" />
///<reference path="typings/q/q.d.ts" />
///<reference path="typings/pluralize/pluralize.d.ts" />

/*

Authors: Mikael Svenson - Elio Struyf
Twitter: @mikaelsvenson - @eliostruyf

Description
-----------

Script which hooks into the query execution flow of a page using search web parts to inject custom query variables using JavaScript

You can attach this script on any page with a script editor web part, content editor web part, custom action or similar.

Usecase 1 - Static variables
----------------------------
Any variable which is persistant for the user across sessions should be loaded 

<TODO: describe load of user variables>
<TODO: describe synonyms scenarios>


Query
-----------
The following query has to be set in the search web part:

{SynonymQuery}

*/
"use strict";

/*****************************************************************************
 * The following variables can be used to configure the script to your needs *
 *****************************************************************************/
const GetUserProfileProperties = false;
const ShowSynonyms = true;
const RemoveNoiseWords = true;
const SynonymsList = 'Synonyms';
const RunOnWebParts = []; //Empty array runs on all web parts, if not add the name of the query group
/****************************************************************************
 * End of the properties to configure                                       *
 ****************************************************************************/

interface SynonymValue {
    Title: string;
    Synonym: string;
    TwoWay: boolean;
}

import Q = require('q');
import pluralize = require('pluralize');
declare var Srch;
declare var Sys;
module spcsr.Search.VariableInjection {
    var _loading = false;
    var _userDefinedVariables = {};
    var _synonymTable = {};
    var _dataProviders = [];
    var _processedIds: string[] = [];
    var _origExecuteQuery = Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQuery;
    var _origExecuteQueries = Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQueries;
    var _getHighlightedProperty = Srch.U.getHighlightedProperty;
    var _siteUrl: string = _spPageContextInfo.webAbsoluteUrl;

    const PROP_SYNONYMQUERY = "SynonymQuery";
    const PROP_SYNONYM = "Synonyms";
    const HIGHLIGHTED_PROPERTIES = 'HitHighlightedProperties';
    const HIGHLIGHTED_SUMMARY = 'HitHighlightedSummary';

    const NOISE_WORDS = "about,after,all,also,an,another,any,are,as,at,be,because,been,before,being,between,both,but,by,came,can,come,could,did,do,each,for,from,get,got,has,had,he,have,her,here,him,himself,his,how,if,in,into,is,it,like,make,many,me,might,more,most,much,must,my,never,now,of,on,only,other,our,out,over,said,same,see,should,since,some,still,such,take,than,that,the,their,them,then,there,these,they,this,those,through,to,too,under,up,very,was,way,we,well,were,what,where,which,while,who,with,would,you,your,a".split(',');

    // Load user poperties and synonyms
    function loadDataAndSearch() {
        if (!_loading) {
            _loading = true;
            // run all async code needed to pull in data for variables
            Q.all([loadSynonyms(), loadUserVariables()]).done(() => {
                // set loaded data as custom query variables
                injectCustomQueryVariables();

                // reset to original function
                Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQuery = _origExecuteQuery;
                Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQueries = _origExecuteQueries;

                // re-issue query for the search web parts
                for (var i = 0; i < _dataProviders.length; i++) {
                    // complete the intercepted event
                    _dataProviders[i].raiseResultReadyEvent(new Srch.ResultEventArgs(_dataProviders[i].get_initialQueryState()));
                    // re-issue query
                    _dataProviders[i].issueQuery();
                }
            });
        }
    }

    // Function to load synonyms asynchronous - poor mans synonyms
    function loadSynonyms() {
        var defer = Q.defer();
        // Check if the code has to retrieve synonyms
        if (!ShowSynonyms) {
            defer.resolve();
            return defer.promise;
        }
        var urlSynonymsList: string = _siteUrl + "/_api/Web/Lists/getByTitle('" + SynonymsList + "')/Items?$select=Title,Synonym,TwoWay";
        var req: XMLHttpRequest = new XMLHttpRequest();
        req.onreadystatechange = function () {
            if (this.readyState === 4) {
                if (this.status === 200) {
                    let data = JSON.parse(this.response);
                    if (typeof data.value !== 'undefined') {
                        let results: SynonymValue[] = data.value;
                        if (results.length) {
                            for (let i = 0; i < results.length; i++) {
                                let item = results[i];
                                if (item.TwoWay) {
                                    let synonyms: string[] = item.Synonym.split(',');
                                    // Set the default synonym
                                    _synonymTable[item.Title.toLowerCase()] = synonyms;
                                    // Loop over the list of synonyms
                                    let tmpSynonyms: string[] = synonyms;
                                    tmpSynonyms.push(item.Title.toLowerCase().trim());
                                    synonyms.forEach(s => {
                                        _synonymTable[s.toLowerCase().trim()] = tmpSynonyms.filter(function (fItem) { return fItem !== s });
                                    });
                                } else {
                                    // Set a single synonym
                                    _synonymTable[item.Title.toLowerCase()] = item.Synonym.split(',');
                                }
                            }
                        }
                    }
                    defer.resolve();
                }
                else if (this.status >= 400) {
                    //console.error("getJSON failed, status: " + this.textStatus + ", error: " + this.error);
                    defer.reject(this.statusText);
                }
            }
        }
        req.open('GET', urlSynonymsList, true);
        req.setRequestHeader('Accept', 'application/json');
        req.send();
        return defer.promise;
    }

    // Function to inject synonyms at run-time
    function processCustomQuery(query: string, dataProvider): void {
        // Remove complex query parts AND/OR/NOT/ANY/ALL/parenthasis/property queries/exclusions - can probably be improved            
        var cleanQuery: string = query.replace(/(-\w+)|(-"\w+.*?")|(-?\w+[:=<>]+\w+)|(-?\w+[:=<>]+".*?")|((\w+)?\(.*?\))|(AND)|(OR)|(NOT)/g, '');
        var queryParts: string[] = cleanQuery.match(/("[^"]+"|[^"\s]+)/g);
        var synonyms: string[] = [];

        // code which should modify the current query based on context for each new query
        if (ShowSynonyms) {
            if (queryParts) {
                for (var i = 0; i < queryParts.length; i++) {
                    if (_synonymTable[queryParts[i]]) {
                        // Replace the current query part in the query with all the synonyms
                        query = query.replace(queryParts[i], String.format('({0} OR {1})', queryParts[i], _synonymTable[queryParts[i]].join(' OR ')));
                        synonyms.push(_synonymTable[queryParts[i]]);
                    }
                }
            }
        }
        // remove noise words from the search query
        if (RemoveNoiseWords) {
            // Call function to remove the noise words from the search query
            query = replaceNoiseWords(query);
        }

        // Update the keyword query
        dataProvider.get_properties()[PROP_SYNONYMQUERY] = query;
        dataProvider.get_properties()[PROP_SYNONYM] = synonyms;
    }

    // Function that replaces the noise words with nothing
    function replaceNoiseWords(query: string): string {
        let t = NOISE_WORDS.length;
        while (t--) {
            query = query.replace(new RegExp('\\b' + NOISE_WORDS[t] + '\\b', "ig"), '')
        }
        return query.trim();
    }

    // Sample function to load user variables asynchronous
    function loadUserVariables() {
        var defer = Q.defer();
        // Check if the code has to retrieve the user profile properties
        if (!GetUserProfileProperties) {
            defer.resolve();
            return defer.promise;
        }
        SP.SOD.executeFunc('sp.js', 'SP.ClientContext', () => {
            // Query user hidden list - not accessible via REST
            // If you want TERM guid's you need to mix and match the use of UserProfileManager and TermStore and cache client side
            var urlCurrentUser: string = _siteUrl + "/_vti_bin/listdata.svc/UserInformationList?$filter=Id eq " + _spPageContextInfo.userId;

            var req = new XMLHttpRequest();
            req.onreadystatechange = function () {
                if (this.readyState === 4) {
                    if (this.status === 200) {
                        var data = JSON.parse(this.response);
                        var user: SP.User = data['d']['results'][0];
                        for (var property in user) {
                            if (user.hasOwnProperty(property)) {
                                var val = user[property];
                                if (typeof val == "number") {
                                    //console.log(property + " : " + val);
                                    _userDefinedVariables["spcsrUser." + property] = val;
                                } else if (typeof val == "string") {
                                    //console.log(property + " : " + val);
                                    _userDefinedVariables["spcsrUser." + property] = val.split(/[\s,]+/);
                                }
                            }
                        }
                        defer.resolve();
                    }
                    else if (this.status >= 400) {
                        //console.error("getJSON failed, status: " + this.textStatus + ", error: " + this.error);
                        defer.reject(this.statusText);
                    }
                }
            }
            req.open('GET', urlCurrentUser, true);
            req.setRequestHeader('Accept', 'application/json');
            req.send();
        });
        return defer.promise;
    }

    function shouldProcessGroup(group: string): boolean {
        if (RunOnWebParts.length === 0) return true;
        if (RunOnWebParts.indexOf(group) != -1) return true;
        if (RunOnWebParts.indexOf(group.toLowerCase()) != -1) return true;
        if (RunOnWebParts.indexOf(group.toUpperCase()) != -1) return true;
        return false;
    }

    // Function to inject custom variables on page load
    function injectCustomQueryVariables(): void {
        var queryGroups = Srch.ScriptApplicationManager.get_current().queryGroups;
        for (var group in queryGroups) {
            if (queryGroups.hasOwnProperty(group) && shouldProcessGroup(group)) {
                var dataProvider = queryGroups[group].dataProvider;
                var properties = dataProvider.get_properties();
                // add all user variables fetched and stored as spcsrUser.
                for (var prop in _userDefinedVariables) {
                    if (_userDefinedVariables.hasOwnProperty(prop)) {
                        properties[prop] = _userDefinedVariables[prop];
                    }
                }

                // set hook for query time variables which can change
                dataProvider.add_queryIssuing((sender, e) => {
                    // Process query (remove noise words and add synonyms)
                    processCustomQuery(e.queryState.k, sender)
                    // reset the processed IDs
                    _processedIds = [];
                });

                _dataProviders.push(dataProvider);
            }
        }
    }

    // Function to add the synonym highlighting to the highlighted properties
    function setSynonymHighlighting(itemId: string, crntItem, mp: string): Function {
        var highlightedProp = crntItem[HIGHLIGHTED_PROPERTIES];
        var highlightedSummary = crntItem[HIGHLIGHTED_SUMMARY];
        // Check if ID is already processed
        if (_processedIds.indexOf(itemId) === -1) {
            var queryGroups = Srch.ScriptApplicationManager.get_current().queryGroups;
            for (var group in queryGroups) {
                if (queryGroups.hasOwnProperty(group) && shouldProcessGroup(group)) {
                    var dataProvider = queryGroups[group].dataProvider;
                    var properties = dataProvider.get_properties();
                    // Check synonym custom property exists
                    if (typeof properties[PROP_SYNONYM] !== 'undefined') {
                        let crntSynonyms = properties[PROP_SYNONYM];
                        // Loop over all the synonyms for the current query
                        for (let i = 0; i < crntSynonyms.length; i++) {
                            let crntSynonym: string[] = crntSynonyms[i];
                            for (let j = 0; j < crntSynonym.length; j++) {
                                let synonymVal: string = crntSynonym[j];
                                // Remove quotes from the synonym
                                synonymVal = synonymVal.replace(/['"]+/g, '');
                                // Highlight synonyms and remove the noise words
                                highlightedProp = highlightSynonyms(highlightedProp, synonymVal);
                                highlightedSummary = highlightSynonyms(highlightedSummary, synonymVal);
                            }
                        }
                    }
                    // Remove the noise words
                    highlightedProp = removeNoiseHighlightWords(highlightedProp);
                    highlightedSummary = removeNoiseHighlightWords(highlightedSummary);
                    _processedIds.push(itemId);
                }
            }
        }
        crntItem[HIGHLIGHTED_PROPERTIES] = highlightedProp;
        crntItem[HIGHLIGHTED_SUMMARY] = highlightedSummary;
        // Call the original highlighting function
        return _getHighlightedProperty(itemId, crntItem, mp);
    }

    // Function that finds the synonyms and adds the required highlight tags
    function highlightSynonyms(prop: string, synVal: string): string {
        // Only highlight synonyms when required
        if (ShowSynonyms) {
            // Remove all <t0/> tags from the property value
            prop = prop.replace(/<t0\/>/g, '');
            // Add the required tags to the highlighted properties
            let occurences: string = prop.split(new RegExp('\\b' + synVal.toLowerCase() + '\\b', 'ig')).join('{replace}');
            if (occurences.indexOf('{replace}') !== -1) {
                // Retrieve all the matching values, this is important to display the same display value
                let matches: string[] = prop.match(new RegExp('\\b' + synVal.toLowerCase() + '\\b', 'ig'));
                if (matches !== null) {
                    matches.forEach((m, index) => {
                        occurences = occurences.replace('{replace}', '<c0>' + m + '</c0>');
                    });
                    prop = occurences;
                }
            }

            // Check the plurals of the synonym
            let synPlural: string = pluralize(synVal);
            if (synPlural !== synVal) {
                prop = highlightSynonyms(prop, synPlural);
            }
        }
        return prop;
    }

    // Function which finds highlighted noise words and removes the highlight tags
    function removeNoiseHighlightWords(prop: string): string {
        // Only remove the noise words when required
        if (RemoveNoiseWords) {
            // Remove noise from highlighting
            var regexp: RegExp = /<c0>(.*?)<\/c0>/ig;
            var noiseWord;
            while ((noiseWord = regexp.exec(prop)) !== null) {
                if (noiseWord.index === regexp.lastIndex) {
                    regexp.lastIndex++;
                }
                // Check if the noise word exists in the array
                if (NOISE_WORDS.indexOf(noiseWord[1].toLowerCase()) !== -1) {
                    // Replace the highlighting with just the noise word
                    prop = prop.replace(noiseWord[0], noiseWord[1]);
                }
            }
        }
        return prop;
    }

    // Loader function to hook in client side custom query variables
    function hookCustomQueryVariables() {
        // TODO: Check if we have cached data, if so, no need to intercept for async web parts
        // Override both executeQuery and executeQueries
        Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQuery = (query: Microsoft.SharePoint.Client.Search.Query.Query) => {
            loadDataAndSearch();
            return new SP.JsonObjectResult();
        }

        Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQueries = (queryIds: string[], queries: Microsoft.SharePoint.Client.Search.Query.Query[], handleExceptions: boolean) => {
            loadDataAndSearch();
            return new SP.JsonObjectResult();
        }

        // Highlight synonyms and remove noise
        Srch.U.getHighlightedProperty = (itemId, crntItem, mp) => {
            return setSynonymHighlighting(itemId, crntItem, mp);
        }
    }

    ExecuteOrDelayUntilBodyLoaded(() => {
        Sys.Application.add_init(hookCustomQueryVariables);
    });
}