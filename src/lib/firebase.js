import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } from 'firebase/firestore'

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// Collection and document references
const SEGMENTS_COLLECTION = 'segments'
const BRENT_DOC = 'brent'

/**
 * Firestore service for syncing segment states
 */
export const firestoreService = {
  /**
   * Update a segment's color in Firestore
   * @param {string} segmentId - The segment ID
   * @param {string} color - The new color (hex)
   */
  async updateSegment(segmentId, color) {
    try {
      const docRef = doc(db, SEGMENTS_COLLECTION, BRENT_DOC)
      await setDoc(docRef, {
        [segmentId]: color,
      }, { merge: true })
      console.log(`Segment ${segmentId} updated to ${color}`)
    } catch (error) {
      console.error('Error updating segment:', error)
      throw error
    }
  },

  /**
   * Get all segment states from Firestore
   * @returns {Promise<Object>} Object mapping segment IDs to colors
   */
  async getSegments() {
    try {
      const docRef = doc(db, SEGMENTS_COLLECTION, BRENT_DOC)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        return docSnap.data()
      } else {
        console.log('No segment data found, starting fresh')
        return {}
      }
    } catch (error) {
      console.error('Error fetching segments:', error)
      throw error
    }
  },

  /**
   * Subscribe to real-time segment updates
   * @param {Function} callback - Called with updated segment data {segmentId: color}
   * @returns {Function} Unsubscribe function
   */
  subscribeToSegments(callback) {
    const docRef = doc(db, SEGMENTS_COLLECTION, BRENT_DOC)

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data())
      } else {
        callback({})
      }
    }, (error) => {
      console.error('Error in snapshot listener:', error)
    })

    return unsubscribe
  },
}
