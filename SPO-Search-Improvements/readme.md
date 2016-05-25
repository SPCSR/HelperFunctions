#SharePoint Online / 2013 / 2016 - User Profile Properties, Noise Words, and Synonyms
##Description
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

##Installation
1. Clone this repo
2. Open a command prompt
3. Navigate to your folder
4. Execute
``
npm install
``

**Important**: You need to have webpack installed - ``npm install webpack -p``

##Compile the code
1. Run ``webpack`` or ``webpack -p`` (if you want the minimized version)

##Script configuration
With the script you are able to automatically retrieve all the user profile properties, remove noise words from the query and search for synonyms.

You have the option to define which type of actions you want to include in your environment:
```javascript
// Retrieve all user profile properties
const GetUserProfileProperties = true;
// Query and show synonyms
const ShowSynonyms = true;
// Remove noise words from your search queries
const RemoveNoiseWords = true;
// Synonym list title
const SynonymsList = 'Synonyms';
// Empty array runs on all web parts or add the name of the query group.
const RunOnWebParts = []; 
```

##Creating the Synonyms List
Create a **Synonyms** (list name) SharePoint list with the following fields: **Title**, **Synonym** (multiple lines without markup), **TwoWay** (yes/no).

![Synonyms list](https://raw.githubusercontent.com/SPCSR/HelperFunctions/master/SPO-Search-Improvements/synonym-list.png "Synonyms list")

**Important**: insert the synonyms comma seperated like you can see in the screenshot.

###Info
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

##Usage
1. Upload the file to your SharePoint Site.
2. Copy the file reference
3. On each search page, add a script editor web part
4. Specify the script reference in the web part ``<script src="enter-your-script-reference"></script>``
5. Edit the **Search Results Web Part** and click on **Change query**
6. Replace **{SearchBoxQuery}** with **{SynonymQuery}**
7. Go to the **Settings** tab and set the **loading behavior** to **Async option: Issue query from the browser**
8. Store these settings and publish the page

##Result
If I do a search query for **mp** on my environment, I should also get results for **managed property**.

![MP Search Query](https://raw.githubusercontent.com/SPCSR/HelperFunctions/master/SPO-Search-Improvements/screenshots/example.png "MP Search Query")

##Credits
Thank you [Mikael Svenson](https://twitter.com/mikaelsvenson) for creating the initial script.