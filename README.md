# Tracking Solution (MVP)
> Using Node.js and SQLite to build simple report at the moment

1. Extract Raw Data
- As-is: csv
- To-be: API

2. Needs to Transform with this Criteria:
- [x] Clean 
- [x] Normalize
- [x] Aggregate

3. Load to Storage
- As-is: SQLite
- To-be: TBD Data Lake solution
> Following ETL framework from this diagram
<img width="1400" height="607" alt="etl diagram, go to repo to see flow" src="https://github.com/user-attachments/assets/d0a73bef-315b-432b-bee8-ca4a4a5b5de7" />

---

### Note
For the logmein inventory, a few steps are required right now, but they will be automated as this project moves forward. 
1. Convert the Logmein full inventory data to csv after it is exported
2. Delete the Title and move data to the top so that the etl tool recognizes headers
