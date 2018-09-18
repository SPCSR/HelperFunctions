# SharePoint Online / 2013 / 2016 - User Profile Properties, Noise Words, and Synonyms
## Description
The query system in SharePoint Search allows for the expansion of query variables query time to create contextual search experiences. Query variables are used in the query templates, specified in web parts, result sources or in query rules.

> An overview of query variables can be found at [S15E03 Query Variables – Constant Trouble](http://www.techmikael.com/2014/05/s15e03-query-variables-constant-trouble.html).

While the query system is quite flexible it has some shortcomings. This project aims to solve the below scenarios, as well as to provide sample code on how you can intercept the query cycle on a SharePoint
page to inject your own asynchronous custom logic before the search query is sent to the server for execution.

1. Synonym expansion without the need for query rules (which becomes very unmanageable over time)
1. Alternative expansion of {User.} variables without a negative impact on SharePoint servers
1. Remove custom noise words from the query
1. Load business data asynchronously to be used in custom query variables
1. Add a mechanism to trigger query rules by user segments with client side code [Server approach MSDN](https://msdn.microsoft.com/en-us/library/office/jj870831.aspx)

> **Note:** In order to inject data before the first search query, the web part must run in asynchronous mode to allow this script to load and intercept.

## Installation
1. Clone this repo
2. Open a command prompt
3. Navigate to your folder
4. Execute
``
npm install
``

**Important**: You need to have webpack installed - ``npm install webpack -p``

## Compile the code
1. Run ``webpack`` or ``webpack -p`` (if you want the minimized version)

## Script configuration
With the script you are able to automatically retrieve all the user profile properties, remove noise words from the query and search for synonyms.

You have the option to define which type of actions you want to include in your environment:
```javascript
// Retrieve all user profile properties
const GetUserProfileProperties = true;
// Query and show synonyms
const ShowSynonyms = true;
// Remove noise words from your search queries
const RemoveNoiseWords = true;
// Add custom date variables
const UseDateVariables = true;
// Synonym list title
const SynonymsList = 'Synonyms';
// Empty array runs on all web parts or add the name of the query group.
// See https://skodvinhvammen.wordpress.com/2015/11/30/how-to-connect-search-result-webparts-using-query-groups/
const RunOnWebParts = []; 
// Names of weekdays
const Weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Names of months
const Months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

```
# List of added query variables

Query variable| Description|
------------- | -------------|
{SynonymQuery} | Re-written query to include synonyms in addition to the original query|
{Synonyms} | Variable containing all the expanded synonyms|
{spcsrUser.&lt;property&gt;} |The property can be any user profile property synchronized to the hidden user information list in SharePoint (*/_catalogs/users/simple.aspx*). The following properties should be available by default: <ul><li>Name</li><li>Account</li><li>WorkEmail</li><li>MobilePhone</li><li>AboutMe</li><li>SIPAddress</li><li>Department</li><li>Title</li><li>FirstName</li><li>LastName</li><li>WorkPhone</li><li>UserName</li><li>AskMeAbout</li><li>Office</li></ul>Multi value properties should be expanded as suchusing the **{&#124;...}** syntax, for example **{&#124;{spcsrUser.AskMeAbout}}**
{Date} | Date of the month 1-31
{UTCDate} | Date of the month 1-31, based on the UTC time zone
{WeekDay}| Name of weekday in English *(can be edited in the file)* 
{UTCWeekDay}| Name of weekday in English *(can be edited in the file)*, based on the UTC time zone
{Hours}| Hour of the day 0-23
{UTCHours}| Hour of the day 0-23, based on the UTC time zone
{Month}| Name of the month in English *(can be edited in the file)*
{UTCMonth}| Name of the month in English *(can be edited in the file)*, based on the UTC time zone
{MonthNumber}| Number of the month 1-12
{UTCMonthNumber}|Number of the month 1-12, based on the UTC time zone
{Year}| Four digit year
{UTCYear}| Four digit year, based on the UTC time zone
{Week}| Week number according to ISO-8601
{UTCWeek}| Week number according to ISO-8601, based on the UTC time zone

# Synonyms
In SharePoint Online the only option you have for synonym expansion is to use query rules which works, but turn into a very tedious task. Also, if you use search operators as part of the query, query rules will not trigger at all.

Using a SharePoint list to handle synonyms makes more sense from a maintenance perspective, and our solution is also more robust.

What happens when the page loads is that it will read all the synonyms from the list, and for each query it will add the re-written query to a query variable **{SynonymQuery}** with the synonyms itself in **{Synonyms}**. 

## Creating the Synonyms List
Create a **Synonyms** (list name) SharePoint list with the following fields: **Title**, **Synonym** (multiple lines without markup), **TwoWay** (yes/no).

![Synonyms list](https://raw.githubusercontent.com/SPCSR/HelperFunctions/master/SPO-Search-Improvements/synonym-list.png "Synonyms list")

**Important**: insert the synonyms comma seperated like you can see in the screenshot.

### Info
By default if you create a thesaurus csv for SharePoint and want to make the synonym work in both ways, you have to specify multiple entries. 

```
Key,Synonym,Language   
HR,Human Resources
```

In this example, if you search on HR you will also get results for Human Resouces, but not the other way around. In order to get that working you have to specify it like this:

```
Key,Synonym,Language   
HR,Human Resources  
Human Resources,HR
```

The **TwoWay** field is in place to solve this issue so that you only have to specify one rule for each synony. So when the synonym should work in both ways, you set the field to **yes**. This also works when you enter multiple values in the Synonym field.

## Usage
1. Upload the file to your SharePoint Site.
2. Copy the file reference
3. On each search page, add a script editor web part
4. Specify the script reference in the web part ``<script src="enter-your-script-reference"></script>``
5. Edit the **Search Results Web Part** and click on **Change query**
6. Replace **{SearchBoxQuery}** with **{SynonymQuery}**
7. Go to the **Settings** tab and set the **loading behavior** to **Async option: Issue query from the browser**
8. Store these settings and publish the page

## Result
If I do a search query for **mp** on my environment, I should also get results for **managed property**.

![MP Search Query](https://raw.githubusercontent.com/SPCSR/HelperFunctions/master/SPO-Search-Improvements/screenshots/example.png "MP Search Query")

# TRigger query rules on User Segments
&lt;TODO&gt;

#Technical details
In order to modify a SharePoint search query before it's being executed you need to hook in your logic at the right stage in the pages JavaScript lifecycle.
This is achieved with the following code snippet:

```javascript
function hookCustomQueryVariables() {
    // Override both executeQuery and executeQueries
    Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQuery = function (query) {
        loadDataAndSearch();
        return new SP.JsonObjectResult();
    };
    Microsoft.SharePoint.Client.Search.Query.SearchExecutor.prototype.executeQueries = function (queryIds, queries, handleExceptions) {
        loadDataAndSearch();
        return new SP.JsonObjectResult();
    };
    // Highlight synonyms and remove noise
    Srch.U.getHighlightedProperty = function (itemId, crntItem, mp) {
        return setSynonymHighlighting(itemId, crntItem, mp);
    };
}
ExecuteOrDelayUntilBodyLoaded(function () {
    Sys.Application.add_init(hookCustomQueryVariables);
});
```
**ExecuteOrDelayUntilBodyLoaded** is first in the life cycle, and ensures our script runs before the SharePoint search web parts. Then we override the single and multi-query functions which allows us to stop the query cycle and perform any asynchronous loading operation before the query continues.

Included is the loading of a users profile properties and synonyms from a list, but this could be a call out to any system which have information you need when crafting a search query.

# Credits
Thank you [Mikael Svenson](https://twitter.com/mikaelsvenson) for creating the initial script, and to [Elio Struyf](https://twitter.com/eliostruyf) for doing the synonym list implementation.
