# Tracking Solution (MVP)
> Using Node.js and SQLite to build report and summary

<img width="1036" height="486" alt="etl_flow_diagram excalidraw" src="https://github.com/user-attachments/assets/eef2976c-5718-4dd2-b48c-d940e82e2c00" />

1. Extract Raw Data
- As-is: csv
- To-be: API

2. Transform Step Criteria:
- [x] Clean
      - uses deduplication logic for hostname values before loading to database
- [x] Normalize
      - standardizes hostname format (capitalization, character limits)
      - serializes data values using hostname identifiers instead of hash values
- [x] Restructures
      - creates dedicated device_coverage table  

3. Load to Storage
- As-is: SQLite
- To-be: TBD Data Lake solution

## Usage
Manual Data Preparation (Pre-ETL):
1. Export LogMeIn inventory to CSV format
2. Remove header/title row from the CSV
3. Save the cleaned CSV file
4. Copy the CSV to your project directory
5. Export CrowdStrike managed assets csv to project folder
6. To build database run command:
```ps1
node .\coverage-cli.js import both logmein.csv crowdstrike.csv
```
7. Generate report after by running command:
```ps1
node coverage-cli.js export both coverage
```

---
### Note
For the logmein inventory, a few steps are required right now, but they will be automated as this project moves forward. 
1. Convert the Logmein full inventory data to csv after it is exported
2. Delete the Title and move data to the top so that the etl tool recognizes headers
