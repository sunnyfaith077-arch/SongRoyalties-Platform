# SongRoyalties Platform

## Overview
SongRoyalties is a decentralized platform built on the Stacks blockchain using Clarity smart contracts. It enables artists to upload songs, define contributors (e.g., producers, songwriters), and set royalty percentages. Royalties are automatically distributed to contributors' wallets based on predefined splits whenever payments are received, with all transactions recorded on-chain for transparency. The platform solves real-world problems in the music industry, including opaque royalty distribution, delayed payments, and disputes over contribution shares.

## Features
- **Song Registration**: Artists upload song metadata and define contributors with their royalty percentages.
- **Contributor Management**: Contributors can be added or updated, with ownership tracked on-chain.
- **Royalty Distribution**: Automated royalty payments to contributors based on predefined splits.
- **Dispute Resolution**: A mechanism to handle disputes over royalty percentages, ensuring fairness.
- **Transparency**: All transactions and royalty splits are recorded on the Stacks blockchain, publicly verifiable.
- **Security**: Clarity's predictable execution ensures safe and auditable smart contracts.

## Smart Contracts
The platform consists of four Clarity smart contracts:

1. **SongRegistry**: Manages song registration, storing metadata (e.g., song title, artist, IPFS hash for audio) and contributor details.
2. **ContributorRegistry**: Handles contributor profiles, including wallet addresses and verification status.
3. **RoyaltyDistributor**: Automatically splits incoming payments based on predefined royalty percentages and distributes them to contributors.
4. **DisputeResolution**: Allows contributors to raise disputes over royalty splits, with a voting mechanism to resolve conflicts.

## Real-World Problems Solved
- **Opaque Royalty Systems**: Traditional music platforms often lack transparency in how royalties are calculated and distributed. SongRoyalties records all splits and payments on-chain, making them publicly verifiable.
- **Delayed Payments**: Contributors often wait months for royalties. The RoyaltyDistributor contract ensures instant, automated payouts when funds are received.
- **Disputes Over Contributions**: Disagreements over royalty splits are common. The DisputeResolution contract provides a transparent, on-chain mechanism to resolve conflicts.
- **Trust Issues**: Artists and contributors often rely on intermediaries. The decentralized nature of SongRoyalties eliminates middlemen, ensuring trustless execution.

## Contract Details

### 1. SongRegistry
- **Purpose**: Registers songs and their metadata, including contributor splits.
- **Functions**:
  - `register-song`: Registers a new song with title, artist, IPFS hash, and contributor splits (percentages summing to 100%).
  - `get-song`: Retrieves song metadata and contributor details.
  - `update-song`: Allows the song owner to update metadata (e.g., IPFS hash) if needed.
- **Data**:
  - Songs map: Stores song ID, title, artist, IPFS hash, and contributor splits.

### 2. ContributorRegistry
- **Purpose**: Manages contributor profiles and verification.
- **Functions**:
  - `register-contributor`: Adds a contributor with their wallet address and name.
  - `verify-contributor`: Allows platform admin to verify contributors.
  - `get-contributor`: Retrieves contributor details.
- **Data**:
  - Contributors map: Stores contributor ID, wallet address, name, and verification status.

### 3. RoyaltyDistributor
- **Purpose**: Handles incoming payments and distributes royalties to contributors.
- **Functions**:
  - `distribute-royalties`: Splits incoming STX (Stacks native token) based on song’s contributor percentages and sends payments.
  - `get-royalty-history`: Retrieves payment history for a song.
- **Data**:
  - Royalties map: Tracks payment amounts and timestamps for each song.

### 4. DisputeResolution
- **Purpose**: Resolves disputes over royalty percentages.
- **Functions**:
  - `raise-dispute`: Allows verified contributors to raise a dispute for a song’s royalty split.
  - `vote-on-dispute`: Enables contributors to vote on proposed percentage changes.
  - `resolve-dispute`: Finalizes dispute based on majority vote, updating royalty splits.
- **Data**:
  - Disputes map: Stores dispute ID, song ID, proposed splits, and votes.

## Implementation Details
- **Blockchain**: Stacks, leveraging Bitcoin’s security for transaction finality.
- **Language**: Clarity, chosen for its decidability and security features, preventing reentrancy and runtime errors.
- **Storage**: Song metadata (e.g., audio files) is stored on IPFS, with hashes recorded on-chain for immutability.
- **Payment**: Royalties are paid in STX, the native token of Stacks, ensuring fast and secure transactions.
- **Frontend Integration**: A web interface (not included in this README) can interact with contracts via the Stacks.js library.

## Clarity Smart Contracts

### SongRegistry.clar
<xaiArtifact artifact_id="081b3c3c-31c4-4ba8-9783-6ef197097f27" artifact_version_id="cc738f12-3395-4f32-97ab-25ce78f0f9b2" title="SongRegistry.clar" contentType="text/clarity">
(define-data-var song-counter uint u0)

(define-map songs
  { song-id: uint }
  {
    title: (string-ascii 100),
    artist: principal,
    ipfs-hash: (string-ascii 46),
    contributors: (list 10 { contributor: principal, percentage: uint }),
    created-at: uint
  }
)

(define-public (register-song (title (string-ascii 100)) (ipfs-hash (string-ascii 46)) (contributors (list 10 { contributor: principal, percentage: uint })))
  (let
    (
      (song-id (var-get song-counter))
      (total-percentage (fold + (map (lambda (c) (get percentage c)) contributors) u0))
    )
    (asserts! (is-eq total-percentage u100) (err u1))
    (asserts! (not (is-none (map-get? contributors { contributor: tx-sender }))) (err u2))
    (map (lambda (c) (asserts! (is-some (map-get? contributors { contributor: (get contributor c) })) (err u3))) contributors)
    (map-insert songs { song-id: song-id }
      {
        title: title,
        artist: tx-sender,
        ipfs-hash: ipfs-hash,
        contributors: contributors,
        created-at: block-height
      }
    )
    (var-set song-counter (+ song-id u1))
    (ok song-id)
  )
)

(define-read-only (get-song (song-id uint))
  (map-get? songs { song-id: song-id })
)

(define-public (update-song (song-id uint) (ipfs-hash (string-ascii 46)))
  (let
    (
      (song (unwrap! (map-get? songs { song-id: song-id }) (err u4)))
    )
    (asserts! (is-eq (get artist song) tx-sender) (err u5))
    (map-set songs { song-id: song-id }
      (merge song { ipfs-hash: ipfs-hash })
    )
    (ok true)
  )
)
</xaiArtifact>

### ContributorRegistry.clar
<xaiArtifact artifact_id="d2192d4f-ad77-498b-ad68-5a37165ef5ad" artifact_version_id="2e5c1743-31a7-41cf-bcf5-bb635b00e9fe" title="ContributorRegistry.clar" contentType="text/clarity">
(define-data-var admin principal tx-sender)
(define-data-var contributor-counter uint u0)

(define-map contributors
  { contributor-id: uint }
  {
    wallet: principal,
    name: (string-ascii 50),
    verified: bool
  }
)

(define-public (register-contributor (name (string-ascii 50)))
  (let
    (
      (contributor-id (var-get contributor-counter))
    )
    (map-insert contributors { contributor-id: contributor-id }
      {
        wallet: tx-sender,
        name: name,
        verified: false
      }
    )
    (var-set contributor-counter (+ contributor-id u1))
    (ok contributor-id)
  )
)

(define-public (verify-contributor (contributor-id uint))
  (let
    (
      (contributor (unwrap! (map-get? contributors { contributor-id: contributor-id }) (err u6)))
    )
    (asserts! (is-eq tx-sender (var-get admin)) (err u7))
    (map-set contributors { contributor-id: contributor-id }
      (merge contributor { verified: true })
    )
    (ok true)
  )
)

(define-read-only (get-contributor (contributor-id uint))
  (map-get? contributors { contributor-id: contributor-id })
)
</xaiArtifact>

### RoyaltyDistributor.clar
<xaiArtifact artifact_id="dfb2f6af-1fbb-4690-9b3b-337dd0c7962a" artifact_version_id="2cb8511d-3539-4198-83f9-8249aa5d24dd" title="RoyaltyDistributor.clar" contentType="text/clarity">
(define-map royalties
  { song-id: uint, payment-id: uint }
  {
    amount: uint,
    timestamp: uint
  }
)

(define-public (distribute-royalties (song-id uint) (amount uint))
  (let
    (
      (song (unwrap! (map-get? songs { song-id: song-id }) (err u8)))
      (payment-id (len (map-get? royalties { song-id: song-id })))
    )
    (map (lambda (c)
      (let
        (
          (recipient (get contributor c))
          (share (/ (* amount (get percentage c)) u100))
        )
        (try! (stx-transfer? share tx-sender recipient))
      )
    ) (get contributors song))
    (map-insert royalties { song-id: song-id, payment-id: payment-id }
      {
        amount: amount,
        timestamp: block-height
      }
    )
    (ok true)
  )
)

(define-read-only (get-royalty-history (song-id uint))
  (map-get? royalties { song-id: song-id })
)
</xaiArtifact>

### DisputeResolution.clar
<xaiArtifact artifact_id="5862cf6a-8749-4afc-b6a8-293aec0d815f" artifact_version_id="34ff9153-df34-4cdf-a7ae-834a750015ce" title="DisputeResolution.clar" contentType="text/clarity">
(define-map disputes
  { dispute-id: uint }
  {
    song-id: uint,
    proposer: principal,
    proposed-splits: (list 10 { contributor: principal, percentage: uint }),
    votes: (list 10 principal),
    resolved: bool
  }
)

(define-data-var dispute-counter uint u0)

(define-public (raise-dispute (song-id uint) (proposed-splits (list 10 { contributor: principal, percentage: uint })))
  (let
    (
      (song (unwrap! (map-get? songs { song-id: song-id }) (err u9)))
      (contributor (unwrap! (map-get? contributors { wallet: tx-sender }) (err u10)))
      (dispute-id (var-get dispute-counter))
      (total-percentage (fold + (map (lambda (c) (get percentage c)) proposed-splits) u0))
    )
    (asserts! (get verified contributor) (err u11))
    (asserts! (is-some (map-get? contributors { wallet: tx-sender })) (err u12))
    (asserts! (is-eq total-percentage u100) (err u13))
    (map-insert disputes { dispute-id: dispute-id }
      {
        song-id: song-id,
        proposer: tx-sender,
        proposed-splits: proposed-splits,
        votes: (list tx-sender),
        resolved: false
      }
    )
    (var-set dispute-counter (+ dispute-id u1))
    (ok dispute-id)
  )
)

(define-public (vote-on-dispute (dispute-id uint))
  (let
    (
      (dispute (unwrap! (map-get? disputes { dispute-id: dispute-id }) (err u14)))
      (song (unwrap! (map-get? songs { song-id: (get song-id dispute) }) (err u15)))
      (contributor (unwrap! (map-get? contributors { wallet: tx-sender }) (err u16)))
    )
    (asserts! (get verified contributor) (err u17))
    (asserts! (is-some (map-get? contributors { wallet: tx-sender })) (err u18))
    (asserts! (not (get resolved dispute)) (err u19))
    (map-set disputes { dispute-id: dispute-id }
      (merge dispute { votes: (append (get votes dispute) tx-sender) })
    )
    (ok true)
  )
)

(define-public (resolve-dispute (dispute-id uint))
  (let
    (
      (dispute (unwrap! (map-get? disputes { dispute-id: dispute-id }) (err u20)))
      (song-id (get song-id dispute))
      (song (unwrap! (map-get? songs { song-id: song-id }) (err u21)))
      (vote-count (len (get votes dispute)))
      (contributor-count (len (get contributors song)))
    )
    (asserts! (>= vote-count (/ contributor-count u2)) (err u22))
    (map-set songs { song-id: song-id }
      (merge song { contributors: (get proposed-splits dispute) })
    )
    (map-set disputes { dispute-id: dispute-id }
      (merge dispute { resolved: true })
    )
    (ok true)
  )
)
</xaiArtifact>

## Getting Started
1. **Deploy Contracts**: Deploy the Clarity contracts on the Stacks blockchain using the Stacks CLI or a compatible wallet.
2. **Register Contributors**: Contributors register via `ContributorRegistry` and get verified by the admin.
3. **Register Songs**: Artists register songs with contributor splits using `SongRegistry`.
4. **Distribute Royalties**: Send STX to the `RoyaltyDistributor` contract to automatically split and distribute royalties.
5. **Handle Disputes**: Contributors can raise disputes via `DisputeResolution`, vote, and resolve conflicts.
6. **Frontend**: Build a web interface using Stacks.js to interact with the contracts.

## Dependencies
- **Stacks Blockchain**: For smart contract execution and STX payments.
- **Clarity**: For writing secure, predictable smart contracts.
- **IPFS**: For storing song audio files off-chain, with hashes stored on-chain.

## Future Enhancements
- Add support for streaming revenue integration.
- Implement a governance token for platform decisions.
- Enhance dispute resolution with time-based voting deadlines.

## License
MIT License
